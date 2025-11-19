import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { getUserLogger } from "../../lib/userLogger";
import { generateWordByWordASS, type WordTimestamp } from "../../lib/assSubtitles";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";
import { getEffect } from "../../lib/videoEffects";
import { generateEffectFrames, cleanupFrames } from "../../lib/frameGenerator";
import { getUserCredits, deductCredits, refundCredits, CREDIT_COSTS } from "../../lib/credits";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// --- Helper to update job progress ---
async function updateJobProgress(jobId: string | null, progress: number) {
  if (!jobId) return; // Skip if jobId is null
  try {
    await supabaseAdmin
      .from('video_generation_jobs')
      .update({ progress })
      .eq('id', jobId);
  } catch (err) {
    console.warn('Failed to update job progress:', err);
  }
}

// --- Convert hex color to ASS color format ---
function convertHexToASSColor(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // ASS format is &HBBGGRR (reversed RGB)
  if (hex.length === 6) {
    const r = hex.substring(0, 2);
    const g = hex.substring(2, 4);
    const b = hex.substring(4, 6);
    return `&H${b}${g}${r}`;
  }

  // Default white if invalid
  return '&HFFFFFF';
}

// --- Helper to get blend settings based on overlay category ---
function getOverlayBlendSettings(category: string): { blendMode: string; opacity: number } {
  // Raw overlay - no effects applied
  return { blendMode: 'screen', opacity: 1.0 };
}

// --- Safe ffprobe helper ---
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        console.warn("⚠️ ffprobe failed, using default 30s duration", err);
        return resolve(30);
      }
      const duration = data?.format?.duration || 0;
      resolve(duration > 1 ? duration : 30); // fallback to 30s if weird
    });
  });
}

// --- Generate SRT subtitle file ---
function generateSRTFile(
  scenes: Array<{ text: string; duration: number }>,
  outputPath: string
): void {
  let currentTime = 0;
  const srtContent = scenes.map((scene, index) => {
    const startTime = currentTime;
    const endTime = currentTime + scene.duration;
    currentTime = endTime;

    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const millis = Math.floor((seconds % 1) * 1000);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    };

    return `${index + 1}\n${formatTime(startTime)} --> ${formatTime(endTime)}\n${scene.text}\n`;
  }).join('\n');

  fs.writeFileSync(outputPath, srtContent, 'utf-8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, aspect_ratio, captions, background_music } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  // Configure fontconfig to use project fonts directory
  // This works the same on local and Railway
  const projectRoot = path.resolve(process.cwd());
  const fontConfigFile = path.join(projectRoot, 'fonts.conf');
  process.env.FONTCONFIG_FILE = fontConfigFile;

  let jobId: string | null = null;

  try {
    // 🚨 CHECK GLOBAL CONCURRENT VIDEO GENERATION LIMIT
    const MAX_CONCURRENT_VIDEOS = parseInt(process.env.MAX_CONCURRENT_VIDEOS || '10');
    const { data: activeJobs, error: activeJobsError } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('id, story_id, started_at')
      .eq('status', 'processing');

    if (activeJobs && activeJobs.length >= MAX_CONCURRENT_VIDEOS) {
      // Check if any are stale
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;
      const staleJobs = activeJobs.filter(job =>
        now - new Date(job.started_at).getTime() > twoMinutes
      );

      if (staleJobs.length > 0) {
        // Clean up stale jobs
        console.log(`⚠️ Cleaning up ${staleJobs.length} stale video generation jobs`);
        await supabaseAdmin
          .from('video_generation_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: 'Job timed out (stale for more than 2 minutes)'
          })
          .in('id', staleJobs.map(j => j.id));
      } else {
        // All jobs are active - server is busy
        return res.status(429).json({
          error: `Server is currently processing ${activeJobs.length} videos. Please try again in a few minutes.`,
          retry_after: 60 // seconds
        });
      }
    }

    // 🚨 CHECK IF VIDEO GENERATION IS ALREADY IN PROGRESS FOR THIS STORY
    const { data: existingJob } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('id, started_at')
      .eq('story_id', story_id)
      .eq('status', 'processing')
      .maybeSingle();

    if (existingJob) {
      // Check if job is stale (older than 2 minutes) - assume it crashed or timed out
      const jobAge = Date.now() - new Date(existingJob.started_at).getTime();
      const twoMinutes = 2 * 60 * 1000;

      if (jobAge > twoMinutes) {
        // Job is stale - mark as failed and allow new generation
        console.log(`⚠️ Stale job detected (${Math.floor(jobAge / 60000)} minutes old), marking as failed`);
        await supabaseAdmin
          .from('video_generation_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: `Job timed out (stale for more than 2 minutes)`
          })
          .eq('id', existingJob.id);

        console.log(`✅ Cleared stale job, proceeding with new generation`);
      } else {
        // Job is recent - still processing
        const startedAt = new Date(existingJob.started_at).toLocaleTimeString();
        const ageMinutes = Math.floor(jobAge / 60000);
        const ageSeconds = Math.floor((jobAge % 60000) / 1000);
        return res.status(409).json({
          error: `Video generation already in progress for this story (started ${ageMinutes}m ${ageSeconds}s ago)`,
          job_id: existingJob.id
        });
      }
    }

    // 🆕 CREATE JOB RECORD TO MARK AS PROCESSING
    const { data: newJob, error: jobError } = await supabaseAdmin
      .from('video_generation_jobs')
      .insert({
        story_id,
        status: 'processing'
      })
      .select('id')
      .single();

    if (jobError || !newJob) {
      console.error("❌ Failed to create job record:", jobError);
      return res.status(500).json({
        error: "Failed to start video generation job"
      });
    }

    jobId = newJob.id;
    console.log(`✅ Created video generation job: ${jobId}`);

    await updateJobProgress(jobId, 5);

    // 💳 Credit check: Get user ID from story
    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("user_id, title")
      .eq("id", story_id)
      .single();

    if (storyError || !story) {
      throw new Error("Story not found");
    }

    // 🚨 Validate user_id exists
    if (!story.user_id) {
      console.error(`❌ Story ${story_id} has no user_id - cannot check credits`);

      // Mark job as failed
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: 'Story has no user association - please recreate the story'
        })
        .eq('id', jobId);

      return res.status(400).json({
        error: `This story has no user association. Please create a new story while logged in.`,
      });
    }

    // At this point, we know userId is not null
    const userId: string = story.user_id;
    const logger = getUserLogger(userId);

    logger.info(`[${story_id}] 🎬 Starting video generation (Job ID: ${jobId})`);
    logger.info(`[${story_id}] 📐 Aspect ratio: ${aspect_ratio || '9:16'}`);
    if (background_music?.enabled) {
      logger.info(`[${story_id}] 🎵 Background music enabled at ${background_music.volume}% volume`);
    }
    logger.info(`[${story_id}] 👤 User ID: ${story.user_id}`);

    // 💳 Check credit balance (will deduct AFTER successful generation)
    const currentBalance = await getUserCredits(userId);
    logger.info(`[${story_id}] 💰 Current balance: ${currentBalance} credits`);
    logger.info(`[${story_id}] 💳 Credits needed: ${CREDIT_COSTS.VIDEO_GENERATION} (will charge after success)`);

    if (currentBalance < CREDIT_COSTS.VIDEO_GENERATION) {
      logger.warn(`[${story_id}] ❌ Insufficient credits: need ${CREDIT_COSTS.VIDEO_GENERATION}, have ${currentBalance}`);

      // Mark job as failed before returning
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: 'Insufficient credits'
        })
        .eq('id', jobId);

      return res.status(402).json({
        error: `Insufficient credits. You need ${CREDIT_COSTS.VIDEO_GENERATION} credit for video generation, but you only have ${currentBalance}.`,
        required_credits: CREDIT_COSTS.VIDEO_GENERATION,
        current_balance: currentBalance
      });
    }

    const tmpDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    await updateJobProgress(jobId, 10);

    // 1️⃣ Fetch scenes with images, videos, audio, word timestamps, and effects
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, order, text, image_url, video_url, audio_url, word_timestamps, effects, duration")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found for this story");
    logger.info(`[${story_id}] 📚 Found ${scenes.length} scenes`);

    await updateJobProgress(jobId, 15);

    // 2️⃣ Verify media (images or videos) exist in scenes
    const scenesWithMedia = scenes.filter(s => s.image_url || (s as any).video_url);
    logger.info(`[${story_id}] 🎬 Found ${scenesWithMedia.length} scenes with media out of ${scenes.length} total`);
    if (!scenesWithMedia.length) throw new Error("No media (images or videos) found for this story");

    // 3️⃣ Download all media files and get audio durations
    const mediaPaths: Array<{
      sceneIndex: number;
      duration: number;
      imagePath?: string;
      videoPath?: string;
      audioPath?: string;
    }> = [];

    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index];
      const sceneFiles: any = { sceneIndex: index, duration: 5 }; // Default 5 seconds if no audio

      // Download video (if user uploaded one) OR image (if AI generated)
      if ((scene as any).video_url) {
        // User uploaded video for this scene
        try {
          const videoRes = await fetch((scene as any).video_url);
          if (!videoRes.ok) {
            throw new Error(`HTTP ${videoRes.status}: ${videoRes.statusText}`);
          }
          const buf = Buffer.from(await videoRes.arrayBuffer());
          const videoPath = path.join(tmpDir, `scene-${index}-video.mp4`);
          fs.writeFileSync(videoPath, buf);
          sceneFiles.videoPath = videoPath;
          logger.info(`[${story_id}] 🎥 Scene ${index + 1} video downloaded successfully`);
        } catch (err: any) {
          logger.error(`[${story_id}] ❌ Failed to download video for scene ${index + 1}: ${err.message}`);
          logger.warn(`[${story_id}] ⚠️ Scene ${index + 1} will be skipped in video generation`);
          // Don't set videoPath - scene will be skipped
        }
      } else if (scene.image_url) {
        // AI-generated image for this scene
        try {
          const imgRes = await fetch(scene.image_url);
          if (!imgRes.ok) {
            throw new Error(`HTTP ${imgRes.status}: ${imgRes.statusText}`);
          }
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const imgPath = path.join(tmpDir, `scene-${index}.png`);
          fs.writeFileSync(imgPath, buf);
          sceneFiles.imagePath = imgPath;
          logger.info(`[${story_id}] 🖼️ Scene ${index + 1} image downloaded successfully`);
        } catch (err: any) {
          logger.error(`[${story_id}] ❌ Failed to download image for scene ${index + 1}: ${err.message}`);
          logger.warn(`[${story_id}] ⚠️ Scene ${index + 1} will be skipped in video generation`);
          // Don't set imagePath - scene will be skipped
        }
      } else {
        logger.info(`[${story_id}] 📝 Scene ${index + 1} has no media - will be text-only`);
      }

      // Download audio if exists
      if (scene.audio_url) {
        const audioRes = await fetch(scene.audio_url);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        const audioPath = path.join(tmpDir, `scene-${index}-audio.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);
        sceneFiles.audioPath = audioPath;
        logger.info(`[${story_id}] 🎵 Scene ${index + 1} audio downloaded`);
      }

      // Always use scene.duration from database (already set correctly during upload/audio generation)
      sceneFiles.duration = (scene as any).duration || 5; // Default to 5s if not set
      logger.info(`[${story_id}] ⏱️ Scene ${index + 1} duration: ${sceneFiles.duration.toFixed(2)}s`);


      // Download overlay if exists
      const overlayUrl = (scene.effects as any)?.overlay_url;
      const overlayId = (scene.effects as any)?.overlay_id;
      if (overlayUrl && overlayId) {
        try {
          logger.info(`[${story_id}] 🎭 Downloading overlay for scene ${index + 1}...`);

          // Fetch overlay metadata to get category
          const { data: overlayData } = await supabaseAdmin
            .from('overlay_effects')
            .select('category')
            .eq('id', overlayId)
            .single();

          // Construct aspect-ratio-specific overlay URL
          // Convert aspect_ratio from "9:16" to "9-16" for folder name
          const aspectFolder = (aspect_ratio || '9:16').replace(':', '-');
          const fileName = overlayUrl.split('/').pop();
          const baseUrl = overlayUrl.substring(0, overlayUrl.lastIndexOf('/'));
          const aspectSpecificUrl = `${baseUrl}/${aspectFolder}/${fileName}`;

          logger.info(`[${story_id}] 📐 Using ${aspectFolder} overlay variant`);
          logger.info(`[${story_id}]    Original URL: ${overlayUrl}`);
          logger.info(`[${story_id}]    Fetching from: ${aspectSpecificUrl}`);

          const overlayRes = await fetch(aspectSpecificUrl);
          logger.info(`[${story_id}]    Response status: ${overlayRes.status} ${overlayRes.statusText}`);
          const overlayBuffer = Buffer.from(await overlayRes.arrayBuffer());
          const overlayPath = path.join(tmpDir, `scene-${index}-overlay.webm`);
          fs.writeFileSync(overlayPath, overlayBuffer);
          sceneFiles.overlayPath = overlayPath;
          sceneFiles.overlayCategory = overlayData?.category || 'other';
          logger.info(`[${story_id}] ✅ Overlay downloaded for scene ${index + 1} (${sceneFiles.overlayCategory})`);
        } catch (err: any) {
          logger.warn(`[${story_id}] ⚠️ Failed to download overlay for scene ${index + 1}: ${err.message}`);
        }
      }

      mediaPaths.push(sceneFiles);
    }

    logger.info(`[${story_id}] 🖼️ Downloaded media for ${mediaPaths.length} scenes`);
    logger.info(`[${story_id}] ⏱️ Scene timing: ${mediaPaths.map(s => `Scene ${s.sceneIndex + 1}: ${s.duration.toFixed(2)}s`).join(', ')}`);

    await updateJobProgress(jobId, 30);

    // 6️⃣ Get old videos for cleanup later (after successful generation)
    const { data: oldVideos } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .eq("story_id", story_id);

    // 7️⃣ Get video dimensions based on aspect ratio
    const aspectRatioMap: { [key: string]: { width: number; height: number } } = {
      "9:16": { width: 2160, height: 3840 },  // Portrait (4K)
      "16:9": { width: 3840, height: 2160 },  // Landscape (4K)
      "1:1": { width: 3840, height: 3840 }    // Square (4K)
    };

    // Preview dimensions (from getPreviewDimensions in [id].tsx)
    const previewDimensionsMap: { [key: string]: { width: number; height: number } } = {
      "9:16": { width: 280, height: 498 },
      "16:9": { width: 498, height: 280 },
      "1:1": { width: 400, height: 400 }
    };

    const selectedAspect = aspect_ratio || "9:16";
    const dimensions = aspectRatioMap[selectedAspect] || aspectRatioMap["9:16"];
    const previewDimensions = previewDimensionsMap[selectedAspect] || previewDimensionsMap["9:16"];
    const width = dimensions.width;
    const height = dimensions.height;

    // Calculate font size scaling factor based on video width vs preview width
    const fontSizeScalingFactor = width / previewDimensions.width;

    logger.info(`[${story_id}] 🎞️ Rendering video at ${width}x${height} (${selectedAspect}), font scale: ${fontSizeScalingFactor.toFixed(2)}x`);

    // 8️⃣ Generate individual scene clips with precise timing and effects
    const videoClips: string[] = [];
    const audioClips: string[] = [];
    const frameDirsToCleanup: string[] = [];

    await updateJobProgress(jobId, 35);

    for (const scene of mediaPaths) {
      // Skip scenes without media (need either video or image)
      if (!scene.videoPath && !scene.imagePath) continue;

      const clipPath = path.join(tmpDir, `clip-${scene.sceneIndex}.mp4`);

      // Get effect for this scene
      const sceneData = scenes[scene.sceneIndex];
      const effectId = sceneData.effects?.motion || "none";
      const effect = getEffect(effectId);

      // 🎥 If scene has an uploaded video, use it directly
      if (scene.videoPath) {
        logger.info(`[${story_id}] 🎥 Scene ${scene.sceneIndex + 1}: Using uploaded video (${scene.duration.toFixed(2)}s)`);

        // Trim/resize video to match story dimensions and duration
        await new Promise<void>((resolve, reject) => {
          ffmpeg(scene.videoPath!)
            .setStartTime(0)
            .setDuration(scene.duration)
            .videoFilters([
              `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
              `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`
            ])
            .videoCodec('libx264')
            .noAudio() // Strip audio (already extracted separately during upload)
            .outputOptions([
              '-pix_fmt yuv420p',
              '-preset medium',
              '-crf 18',
            ])
            .save(clipPath)
            .on('end', () => {
              logger.info(`[${story_id}] ✅ Scene ${scene.sceneIndex + 1} video processed and trimmed to ${scene.duration.toFixed(2)}s`);
              resolve();
            })
            .on('error', (err: any) => {
              logger.error(`[${story_id}] ❌ Error processing video for scene ${scene.sceneIndex + 1}: ${err.message}`);
              reject(err);
            });
        });

        videoClips.push(clipPath);
        if (scene.audioPath) {
          audioClips.push(scene.audioPath);
        }
        continue; // Skip image processing for video clips
      }

      logger.info(`[${story_id}] 🎬 Scene ${scene.sceneIndex + 1}: Applying "${effect.name}" effect`);

      // Use frame-by-frame rendering for smooth effects
      if (effectId !== "none" && scene.imagePath) {
        const framesDir = path.join(tmpDir, `frames-${scene.sceneIndex}`);
        frameDirsToCleanup.push(framesDir);

        logger.info(`[${story_id}] 🖼️ Generating smooth frames at 30fps...`);

        await generateEffectFrames({
          imagePath: scene.imagePath,
          outputDir: framesDir,
          width,
          height,
          duration: scene.duration,
          effectType: effectId,
          fps: 30, // Smooth playback for particle overlays
        });

        logger.info(`[${story_id}] ✅ Frames generated, encoding video...`);

        // If scene has overlay, apply it; otherwise just encode frames
        if ((scene as any).overlayPath) {
          // First, encode frames to a temporary video
          const tempClipPath = path.join(tmpDir, `temp-clip-${scene.sceneIndex}.mp4`);

          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(path.join(framesDir, "frame_%06d.png"))
              .inputOptions(["-framerate 30"])
              .videoCodec("libx264")
              .noAudio()
              .outputOptions([
                "-pix_fmt yuv420p",
                "-preset medium",
                "-crf 15",
              ])
              .save(tempClipPath)
              .on("end", () => resolve())
              .on("error", (err: any) => reject(err));
          });

          logger.info(`[${story_id}] 🎭 Applying overlay to motion effect...`);

          // Get blend settings based on overlay category
          const overlayCategory = (scene as any).overlayCategory || 'other';
          const blendSettings = getOverlayBlendSettings(overlayCategory);
          logger.info(`[${story_id}]    Using ${blendSettings.blendMode} mode with ${blendSettings.opacity} opacity`);

          // Then apply overlay on top using proper alpha compositing
          await new Promise<void>((resolve, reject) => {
            logger.info(`[${story_id}] 🎭 Applying overlay: ${(scene as any).overlayPath}`);
            logger.info(`[${story_id}]    Category: ${overlayCategory}`);

            // Smart scaling strategy for all aspect ratios:
            // Scale so smallest dimension fills frame, center the overlay, allow natural overflow
            // This works for 9:16, 16:9, and 1:1 without extreme zoom or gaps
            let filterComplex;
            // Screen blend in RGB using gbrp format (no colorkey)
            filterComplex = `[0:v]fps=30,scale=${width}:${height}:flags=lanczos,setsar=1,format=gbrp[bg];[1:v]fps=30,scale=${width}:${height}:flags=lanczos,setsar=1,format=gbrp[ov];[bg][ov]blend=all_mode=screen:all_opacity=1.0[comp];[comp]format=yuv420p`;

            logger.info(`[${story_id}]    Filter: ${filterComplex}`);

            const cmd = ffmpeg()
              .input(tempClipPath) // Input 0: motion effect video
              .input((scene as any).overlayPath!) // Input 1: overlay
              .inputOptions(["-stream_loop", "-1"]) // Loop overlay
              .videoCodec("libx264")
              .noAudio()
              .complexFilter(filterComplex)
              .outputOptions([
                "-pix_fmt yuv420p",
                "-color_primaries bt709",
                "-color_trc bt709",
                "-colorspace bt709",
                `-t ${scene.duration}`,
                "-r 30",
                "-preset medium",
                "-crf 15",
              ])
              .save(clipPath);

            cmd.on("start", (cmdLine) => {
              logger.info(`[${story_id}] 🚀 FFmpeg command: ${cmdLine}`);
            });

            cmd.on("end", () => {
              logger.info(`[${story_id}] ✅ Overlay applied successfully`);
              // Clean up temp file
              fs.unlinkSync(tempClipPath);
              resolve();
            });

            cmd.on("error", (err: any) => {
              logger.error(`[${story_id}] ❌ Overlay failed: ${err.message}`);
              reject(err);
            });
          });
        } else {
          // No overlay - just encode frames
          logger.info(`[${story_id}] ✅ Encoding video without overlay...`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(path.join(framesDir, "frame_%06d.png"))
              .inputOptions(["-framerate 30"])
              .videoCodec("libx264")
              .noAudio()
              .outputOptions([
                "-pix_fmt yuv420p",
                `-t ${scene.duration}`,
                "-r 30",
                "-preset medium",
                "-crf 15",
              ])
              .save(clipPath)
              .on("end", () => {
                logger.info(`[${story_id}] ✅ Video clip saved: ${clipPath}`);
                resolve();
              })
              .on("error", (err: any) => reject(err));
          });
        }

      } else {
        // No motion effect - use static image with simple scaling

        // Skip scene if no image exists
        if (!scene.imagePath) {
          logger.warn(`[${story_id}] ⚠️ Scene ${scene.sceneIndex + 1} has no image - skipping video generation for this scene`);
          continue;
        }

        const videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;

        // Check if scene has overlay
        if ((scene as any).overlayPath) {
          // Get blend settings based on overlay category
          const overlayCategory = (scene as any).overlayCategory || 'other';
          const blendSettings = getOverlayBlendSettings(overlayCategory);
          logger.info(`[${story_id}] 🎭 Applying overlay with ${blendSettings.blendMode} mode (${blendSettings.opacity} opacity)`);

          // Apply overlay using proper alpha compositing
          await new Promise<void>((resolve, reject) => {
            logger.info(`[${story_id}] 🎭 Applying overlay to static image: ${(scene as any).overlayPath}`);
            logger.info(`[${story_id}]    Category: ${overlayCategory}`);

            // Smart scaling strategy for all aspect ratios:
            // Scale so smallest dimension fills frame, center the overlay, allow natural overflow
            // This works for 9:16, 16:9, and 1:1 without extreme zoom or gaps
            let filterComplex;
            // Screen blend in RGB using gbrp format (no colorkey)
            filterComplex = `[0:v]${videoFilter},fps=30,setsar=1,format=gbrp[bg];[1:v]fps=30,scale=${width}:${height}:flags=lanczos,setsar=1,format=gbrp[ov];[bg][ov]blend=all_mode=screen:all_opacity=1.0[comp];[comp]format=yuv420p`;

            logger.info(`[${story_id}]    Filter: ${filterComplex}`);

            const cmd = ffmpeg()
              .input(scene.imagePath!) // Input 0: image
              .inputOptions(["-loop", "1", "-framerate", "15"])
              .input((scene as any).overlayPath!) // Input 1: overlay video
              .inputOptions(["-stream_loop", "-1"]) // Loop overlay to match duration
              .videoCodec("libx264")
              .noAudio()
              .complexFilter(filterComplex)
              .outputOptions([
                "-pix_fmt yuv420p",
                "-color_primaries bt709",
                "-color_trc bt709",
                "-colorspace bt709",
                `-t ${scene.duration}`,
                "-r 30",
                "-preset medium",
                "-crf 15",
              ])
              .save(clipPath);

            cmd.on("start", (cmdLine) => {
              logger.info(`[${story_id}] 🚀 FFmpeg command: ${cmdLine}`);
            });

            cmd.on("end", () => {
              logger.info(`[${story_id}] ✅ Overlay applied successfully`);
              resolve();
            });

            cmd.on("error", (err: any) => {
              logger.error(`[${story_id}] ❌ Overlay failed: ${err.message}`);
              reject(err);
            });
          });
        } else {
          // No overlay - simple static image
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(scene.imagePath!)
              .inputOptions(["-loop 1", "-framerate 15"]) // Match effect clips framerate
              .videoCodec("libx264")
              .noAudio()
              .outputOptions([
                "-pix_fmt yuv420p",
                `-vf ${videoFilter}`,
                `-t ${scene.duration}`,
                "-r 30", // Smooth playback for overlays
                "-preset medium", // Match effect clips preset
                "-crf 15", // Match effect clips quality
              ])
              .save(clipPath)
              .on("end", () => resolve())
              .on("error", (err: any) => reject(err));
          });
        }
      }

      videoClips.push(clipPath);

      // If scene has audio, add it to audio clips list
      if (scene.audioPath) {
        audioClips.push(scene.audioPath);
      }

      // Update progress for each scene processed (35-55% range)
      const sceneProgress = 35 + Math.floor((scene.sceneIndex + 1) / mediaPaths.length * 20);
      await updateJobProgress(jobId, sceneProgress);
    }

    await updateJobProgress(jobId, 55);

    // Cleanup frame directories
    logger.info(`[${story_id}] 🧹 Cleaning up ${frameDirsToCleanup.length} frame directories...`);
    for (const framesDir of frameDirsToCleanup) {
      try {
        cleanupFrames(framesDir);
      } catch (err: any) {
        logger.warn(`[${story_id}] ⚠️ Failed to cleanup ${framesDir}: ${err.message}`);
      }
    }

    await updateJobProgress(jobId, 60);

    // 9️⃣ Combine all video clips
    const videoOnlyPath = path.join(tmpDir, `video-only-${story_id}.mp4`);

    await updateJobProgress(jobId, 62);

    // If captions are enabled, generate ASS subtitle file with word-by-word animation
    let captionFilter = "";
    if (captions?.enabled) {
      logger.info(`[${story_id}] 🎨 Generating captions with style: ${captions.style}, position: ${captions.position}`);

      // Collect all word timestamps and full text from all scenes
      const allWordTimestamps: WordTimestamp[] = [];
      const allSceneTexts: string[] = [];
      let timeOffset = 0;

      for (const scene of mediaPaths) {
        const sceneData = scenes[scene.sceneIndex];
        allSceneTexts.push(sceneData.text); // Collect text for sentence boundary detection

        if (sceneData.word_timestamps && Array.isArray(sceneData.word_timestamps)) {
          // Use existing timestamps from database
          // These are either:
          // 1. Audio-aligned timestamps (if audio was generated via Echogarden)
          // 2. Synthetic timestamps (generated at scene creation time)
          sceneData.word_timestamps.forEach((wt: any) => {
            allWordTimestamps.push({
              word: wt.word,
              start: wt.start + timeOffset,
              end: wt.end + timeOffset
            });
          });
        } else {
          // Fallback: Generate synthetic word timestamps (for backwards compatibility with old scenes)
          const words = sceneData.text.split(/\s+/);
          const wordsPerSecond = 2; // Reading speed (same as duration calculation)
          const wordDuration = 1 / wordsPerSecond;

          words.forEach((word: string, i: number) => {
            const start = timeOffset + (i * wordDuration);
            const end = start + wordDuration;
            allWordTimestamps.push({
              word: word,
              start: start,
              end: end
            });
          });
        }
        timeOffset += scene.duration;
      }

      // Combine all scene texts for sentence boundary detection
      const fullText = allSceneTexts.join(' ');

      logger.info(`[${story_id}] 📝 Collected ${allWordTimestamps.length} word timestamps from ${mediaPaths.length} scenes`);

      // Use word-by-word ASS if we have timestamps, otherwise fallback to simple SRT
      const assPath = path.join(tmpDir, `subtitles-${story_id}.ass`);

      if (allWordTimestamps.length > 0) {
        // Create custom ASS style from caption settings
        const positionFromBottom = captions.positionFromBottom !== undefined ? captions.positionFromBottom : 20;

        // Calculate marginV based on percentage from bottom
        // For 9:16 video (1080x1920), convert percentage to pixels
        // marginV represents distance from bottom edge
        const videoHeight = height; // Use actual video height
        const marginV = Math.round((positionFromBottom / 100) * videoHeight);

        // Scale font size to match preview appearance
        const previewFontSize = captions.fontSize || 20;
        const scaledFontSize = Math.round(previewFontSize * fontSizeScalingFactor);

        // Map CSS font weight to ASS font name with weight variant
        // This ensures the same visual weight as preview
        const fontWeight = captions.fontWeight || 600;
        let fontNameWithWeight = captions.fontFamily || 'Montserrat';
        let assBold = 0;

        // Use specific font weight variants for better matching
        if (fontWeight >= 700) {
          fontNameWithWeight += ' Bold';
          assBold = 1; // Also set bold flag for fallback
        } else if (fontWeight >= 600) {
          fontNameWithWeight += ' SemiBold';
          assBold = 0;
        } else if (fontWeight >= 500) {
          fontNameWithWeight += ' Medium';
          assBold = 0;
        }
        // else use Regular (default, no suffix needed)

        const assStyle: any = {
          name: 'Custom',
          fontName: fontNameWithWeight,
          fontSize: scaledFontSize,
          primaryColour: convertHexToASSColor(captions.inactiveColor || '#FFFFFF'),
          bold: assBold,
          italic: 0,
          outline: 0, // No outline - matches preview's clean text
          shadow: 3, // Drop shadow - matches preview's textShadow
          alignment: 2, // Bottom center
          marginV: marginV,
        };

        logger.info(`[${story_id}] 📏 Font: "${fontNameWithWeight}", size: ${previewFontSize}px (preview) → ${scaledFontSize}pt (video) [${fontSizeScalingFactor.toFixed(2)}x scale]`);
        logger.info(`[${story_id}] 📏 Font weight: ${fontWeight} (CSS) → "${fontNameWithWeight}" (ASS), bold=${assBold}`);
        logger.info(`[${story_id}] 📐 ASS subtitle resolution: ${width}x${height}, marginV: ${marginV}px (${positionFromBottom}% from bottom)`);

        // Generate ASS with word-by-word animation and custom highlight color
        const highlightColor = convertHexToASSColor(captions.activeColor || '#FFEB3B');
        const wordsPerBatch = captions.wordsPerBatch || 0; // 0 = show all words
        const textTransform = captions.textTransform || 'none';

        const assContent = generateWordByWordASS(
          allWordTimestamps,
          assStyle,
          highlightColor,
          wordsPerBatch,
          textTransform,
          fullText,
          width,  // Pass actual video width for correct PlayResX
          height  // Pass actual video height for correct PlayResY
        );
        fs.writeFileSync(assPath, assContent);
        logger.info(`[${story_id}] ✅ Generated word-by-word ASS subtitles with ${wordsPerBatch > 0 ? wordsPerBatch + ' words per batch' : 'all words'}, transform: ${textTransform}`);
      } else {
        // Fallback to simple SRT if no word timestamps
        logger.warn(`[${story_id}] ⚠️ No word timestamps available, using simple scene-level captions`);
        const srtPath = path.join(tmpDir, `subtitles-${story_id}.srt`);
        generateSRTFile(
          mediaPaths.map(scene => ({ text: scenes[scene.sceneIndex].text, duration: scene.duration })),
          srtPath
        );
        // Convert SRT to ASS for consistency (will use simple display)
        // For now, just use SRT path
        logger.info(`[${story_id}] ✅ Generated simple SRT subtitles: ${srtPath}`);
      }

      // Escape the ASS path for FFmpeg
      const escapedAssPath = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\\\:');
      captionFilter = escapedAssPath;

      logger.info(`[${story_id}] 📝 Caption file ready: ${assPath}`);
    }

    await updateJobProgress(jobId, 65);

    await new Promise<void>((resolve, reject) => {
      // Use concat FILTER instead of concat demuxer to properly handle videos with different frame rates
      logger.info(`[${story_id}] 🎬 Concatenating ${videoClips.length} video clips with concat filter...`);

      // Build FFmpeg command with each clip as a separate input
      let cmd = ffmpeg();
      videoClips.forEach((clipPath) => {
        cmd = cmd.input(clipPath);
      });

      // Build concat filter: [0:v][1:v]concat=n=2:v=1:a=0[concatv]
      const concatInputs = videoClips.map((_, i) => `[${i}:v]`).join('');
      const concatFilterStr = `${concatInputs}concat=n=${videoClips.length}:v=1:a=0[concatv]`;

      // Add floating watermark (always enabled) - moves in smooth, pseudo-random pattern
      // Scale watermark font size to match preview (14px in preview -> scaled for video)
      const watermarkPreviewFontSize = 14; // Preview watermark font size (from [id].tsx line 5173)
      const watermarkScaledFontSize = Math.round(watermarkPreviewFontSize * fontSizeScalingFactor);
      logger.info(`[${story_id}] 🏷️ Watermark font size: ${watermarkPreviewFontSize}px (preview) → ${watermarkScaledFontSize}pt (video)`);

      // Constrained watermark movement: x ranges from 15% to 65%, y ranges from 20% to 80%
      // This prevents text cutoff at edges while maintaining smooth movement
      const watermarkFilter = `drawtext=text='AiVideoGen.cc':fontsize=${watermarkScaledFontSize}:fontcolor=white@0.4:x='w*0.15 + w*0.25*sin(2*PI*t/83)':y='h*0.20 + h*0.30*cos(2*PI*t/97)':shadowcolor=black@0.3:shadowx=1:shadowy=1`;

      // Build complete filter chain: concat -> subtitles (optional) -> watermark -> output
      let filterComplex;
      if (captionFilter) {
        // Concat -> Captions -> Watermark
        filterComplex = `${concatFilterStr};[concatv]subtitles=${captionFilter}[captioned];[captioned]${watermarkFilter}[outv]`;
        logger.info(`[${story_id}] 🏷️ Adding concat + captions + watermark to video`);
      } else {
        // Concat -> Watermark only
        filterComplex = `${concatFilterStr};[concatv]${watermarkFilter}[outv]`;
        logger.info(`[${story_id}] 🏷️ Adding concat + watermark to video`);
      }

      cmd
        .complexFilter(filterComplex)
        .outputOptions([
          "-map [outv]",
          "-c:v libx264",
          "-crf 18", // High quality (same as individual clips)
          "-preset medium",
          "-pix_fmt yuv420p",
          "-movflags +faststart",
        ])
        .save(videoOnlyPath)
        .on("start", (cmdLine) => {
          logger.info(`[${story_id}] 🚀 FFmpeg concat filter: ${cmdLine.substring(0, 200)}...`);
        })
        .on("end", () => {
          logger.info(`[${story_id}] ✅ Video clips concatenated with filters applied`);
          resolve();
        })
        .on("error", (err: any) => {
          logger.error(`[${story_id}] ❌ FFmpeg concat failed: ${err.message}`);
          reject(err);
        });
    });

    await updateJobProgress(jobId, 72);

    // 🔟 Create final video - video already has correct timing, just add audio track
    const finalVideo = path.join(tmpDir, `final-video-${story_id}.mp4`);

    // Concat all scene audio files into one track
    const hasAudio = mediaPaths.some(s => s.audioPath);

    if (hasAudio) {
      // Pad each scene's audio to match its video duration, then concat
      const paddedAudioFiles: string[] = [];

      for (let i = 0; i < mediaPaths.length; i++) {
        const scene = mediaPaths[i];

        if (scene.audioPath) {
          // Pad audio to match scene duration
          const paddedAudioPath = path.join(tmpDir, `padded-audio-${i}.m4a`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg(scene.audioPath!)
              .audioFilters([
                `apad=whole_dur=${scene.duration}` // Pad with silence to match video duration
              ])
              .audioCodec("aac")
              .audioBitrate("256k")
              .audioChannels(2)
              .audioFrequency(48000)
              .save(paddedAudioPath)
              .on("end", () => resolve())
              .on("error", reject);
          });
          paddedAudioFiles.push(paddedAudioPath);
          logger.info(`[${story_id}] 🎵 Scene ${i + 1} audio padded to ${scene.duration.toFixed(2)}s`);
        } else {
          // No audio for this scene - create silence
          const silencePath = path.join(tmpDir, `silence-${i}.m4a`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input('anullsrc=r=48000:cl=stereo')
              .inputOptions(['-f lavfi'])
              .duration(scene.duration)
              .audioCodec("aac")
              .audioBitrate("256k")
              .save(silencePath)
              .on("end", () => resolve())
              .on("error", reject);
          });
          paddedAudioFiles.push(silencePath);
          logger.info(`[${story_id}] 🔇 Scene ${i + 1} silence created for ${scene.duration.toFixed(2)}s`);
        }
      }

      // Create concat file for padded audio
      const audioConcat = path.join(tmpDir, "audio-concat.txt");
      fs.writeFileSync(audioConcat, paddedAudioFiles.map(p => `file '${p}'`).join("\n"));

      // Concat audio files (narration) with high quality settings and normalization
      const mergedNarrationAudio = path.join(tmpDir, "merged-narration.m4a");
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(audioConcat)
          .inputOptions(["-f concat", "-safe 0"])
          .audioFilters([
            "volume=0.85", // Reduce volume slightly to prevent clipping
            "acompressor=threshold=-18dB:ratio=3:attack=5:release=50" // Gentle compression for consistent levels
          ])
          .audioCodec("aac")
          .audioBitrate("256k") // High quality audio bitrate
          .audioChannels(2) // Stereo
          .audioFrequency(48000) // 48kHz sample rate for better quality
          .save(mergedNarrationAudio)
          .on("end", () => resolve())
          .on("error", reject);
      });

      logger.info(`[${story_id}] 🎵 Concatenated all scene audio files with normalization (85% volume + gentle compression for clarity)`);

      await updateJobProgress(jobId, 75);

      let finalAudioTrack = mergedNarrationAudio;

      // Mix background music if enabled and volume > 0
      if (background_music?.enabled && background_music?.music_url && (background_music.volume ?? 30) > 0) {
        logger.info(`[${story_id}] 🎵 Downloading background music...`);

        await updateJobProgress(jobId, 77);

        const bgMusicPath = path.join(tmpDir, "background-music.mp3");
        const bgRes = await fetch(background_music.music_url);
        const bgBuffer = Buffer.from(await bgRes.arrayBuffer());
        fs.writeFileSync(bgMusicPath, bgBuffer);

        // Get total video duration
        const totalDuration = mediaPaths.reduce((sum, scene) => sum + scene.duration, 0);
        // Use nullish coalescing to properly handle 0 volume (0 || 30 = 30, but 0 ?? 30 = 0)
        const bgVolume = (background_music.volume ?? 30) / 100; // Convert percentage to 0-1 scale
        const narrationVolume = 1.0; // Narration already normalized in concat step

        logger.info(`[${story_id}] 🎵 Mixing background music (${background_music.volume ?? 30}% volume) with narration for ${totalDuration.toFixed(2)}s`);

        // Mix background music with narration
        const mixedAudio = path.join(tmpDir, "mixed-audio.m4a");
        await new Promise<void>((resolve, reject) => {
          const cmd = ffmpeg()
            .input(mergedNarrationAudio) // Input 0: Narration
            .input(bgMusicPath) // Input 1: Background music
            .complexFilter([
              // Loop background music to match video duration
              `[1:a]aloop=loop=-1:size=2e+09[bg]`,
              // Adjust volumes
              `[0:a]volume=${narrationVolume}[narration]`,
              `[bg]volume=${bgVolume}[bgadjusted]`,
              // Mix both audios - no normalization to preserve dynamics
              `[narration][bgadjusted]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed]`
            ])
            .outputOptions([
              "-map [mixed]",
              `-t ${totalDuration}`, // Trim to video duration
              "-c:a aac",
              "-b:a 256k", // High quality audio bitrate
              "-ar 48000" // 48kHz sample rate
            ])
            .save(mixedAudio);

          cmd.on("start", (cmdLine) => logger.info(`[${story_id}] 🚀 FFmpeg mixing: ${cmdLine}`));
          cmd.on("end", () => {
            logger.info(`[${story_id}] ✅ Background music mixed with narration`);
            resolve();
          });
          cmd.on("error", (err: any) => {
            logger.error(`[${story_id}] ❌ FFmpeg mixing failed: ${err.message}`);
            reject(err);
          });
        });

        finalAudioTrack = mixedAudio;

        await updateJobProgress(jobId, 80);
      }

      // Combine video with final audio track
      await updateJobProgress(jobId, 82);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoOnlyPath)
          .input(finalAudioTrack)
          .outputOptions([
            "-c:v copy",  // Copy video without re-encoding
            "-c:a aac",
            "-b:a 256k",  // High quality audio bitrate
            "-ar 48000",  // 48kHz sample rate
            "-map 0:v:0",
            "-map 1:a:0",
            "-shortest",  // End when shortest stream ends
            "-movflags +faststart"
          ])
          .save(finalVideo)
          .on("start", (cmd: any) => logger.info(`[${story_id}] 🚀 FFmpeg final merge: ${cmd}`))
          .on("end", () => {
            logger.info(`[${story_id}] ✅ Final video with audio track created`);
            resolve();
          })
          .on("error", (err: any) => {
            logger.error(`[${story_id}] ❌ FFmpeg failed: ${err.message}`);
            reject(err);
          });
      });
    } else {
      // No audio, just use video as is
      fs.copyFileSync(videoOnlyPath, finalVideo);
      logger.info(`[${story_id}] ✅ Video-only (no audio)`);
    }

    await updateJobProgress(jobId, 85);

    // 11️⃣ Upload final video
    const buffer = fs.readFileSync(finalVideo);
    const fileName = `video-${story_id}-${Date.now()}.mp4`;

    const { error: uploadErr } = await supabaseAdmin.storage
    .from("videos")
    .upload(fileName, buffer, {
        contentType: "video/mp4",
        upsert: true,
    });

    if (uploadErr) throw uploadErr;

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;

    // 12️⃣ Save video metadata and mark as valid
    const totalDuration = mediaPaths.reduce((sum, scene) => sum + scene.duration, 0);

    const { error: upsertErr } = await supabaseAdmin
    .from("videos")
    .upsert(
        {
        story_id,
        video_url: publicUrl,
        is_valid: true,  // Mark video as valid
        duration: totalDuration,
        created_at: new Date().toISOString(),
        },
        { onConflict: "story_id" } // ensures one video per story
    );

    if (upsertErr) throw upsertErr;

    logger.info(`[${story_id}] ☁️ Uploaded video → ${publicUrl} (${totalDuration.toFixed(1)}s total)`);

    // 🧹 Clean up old videos ONLY after new video is successfully uploaded and saved
    if (oldVideos?.length) {
      logger.info(`[${story_id}] 🧹 Cleaning up ${oldVideos.length} old video(s)...`);
      const paths = oldVideos
        .map((v) => {
          try {
            return v.video_url.split("/videos/")[1];
          } catch (err) {
            return null;
          }
        })
        .filter((p): p is string => p !== null && p !== fileName); // Don't delete the video we just uploaded

      if (paths.length > 0) {
        const { error: delErr } = await supabaseAdmin.storage.from("videos").remove(paths);
        if (delErr) {
          logger.warn(`[${story_id}] ⚠️ Error deleting old videos: ${delErr.message}`);
        } else {
          logger.info(`[${story_id}] ✅ Deleted ${paths.length} old video file(s) from storage`);
        }
      }
    }

    await updateJobProgress(jobId, 95);

    // Update story metadata (completion status)
    logger.info(`[${story_id}] 📊 Updating story metadata...`);
    await updateStoryMetadata(story_id);
    logger.info(`[${story_id}] ✅ Story metadata updated`);

    // 💳 Deduct credits AFTER successful video generation
    if (CREDIT_COSTS.VIDEO_GENERATION > 0) {
      logger.info(`[${story_id}] 💳 Deducting ${CREDIT_COSTS.VIDEO_GENERATION} credit after successful generation...`);
      const deductResult = await deductCredits(
        userId,
        CREDIT_COSTS.VIDEO_GENERATION,
        'deduction_video',
        `Video generation for story: ${story.title || story_id}`,
        story_id
      );

      if (!deductResult.success) {
        logger.error(`[${story_id}] ⚠️ Failed to deduct credits after generation: ${deductResult.error}`);
        // Video was generated successfully, so we don't fail the request
        // Admin can manually adjust credits if needed
      } else {
        logger.info(`[${story_id}] ✅ Deducted ${CREDIT_COSTS.VIDEO_GENERATION} credit. New balance: ${deductResult.newBalance}`);
      }
    } else {
      logger.info(`[${story_id}] ✅ Video generation is currently free (0 credits)`);
    }

    // ✅ MARK JOB AS COMPLETED
    if (jobId) {
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({
          status: 'completed',
          progress: 100,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
      logger.info(`[${story_id}] ✅ Video generation job ${jobId} marked as completed`);
    }

    // Track analytics event
    await supabaseAdmin.from("analytics_events").insert({
      user_id: story.user_id,
      event_name: 'video_generated',
      event_data: {
        story_id,
        duration: totalDuration,
        aspect_ratio: aspect_ratio || '9:16'
      }
    });

    res.status(200).json({ story_id, video_url: publicUrl, duration: totalDuration, is_valid: true, job_id: jobId });
  } catch (err: any) {
    console.error(`[${story_id}] Error generating video:`, err);

    // ❌ MARK JOB AS FAILED
    if (jobId) {
      try {
        await supabaseAdmin
          .from('video_generation_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: err.message || 'Unknown error'
          })
          .eq('id', jobId);
        console.log(`❌ Video generation job ${jobId} marked as failed`);
      } catch (updateErr) {
        console.error("Failed to update job status:", updateErr);
      }
    }

    // No refund needed since credits are only deducted after success
    res.status(500).json({ error: err.message });
  }
}
