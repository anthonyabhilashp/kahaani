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
import { getUserCredits, deductCredits, refundCredits, CREDIT_COSTS } from "../../lib/credits";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";

export const config = {
  api: {
    bodyParser: { sizeLimit: "4mb" },
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes timeout for video generation
};

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

  const jobFolder = uuidv4();
  let tmpDir = path.join(process.cwd(), "tmp", jobFolder);
  let shouldCleanupTmp = false;
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

    // 💳 Credit check: Get user ID from story (do this BEFORE returning)
    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("user_id, title")
      .eq("id", story_id)
      .single();

    if (storyError || !story) {
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error: 'Story not found' })
        .eq('id', jobId);
      return res.status(404).json({ error: "Story not found" });
    }

    // 🚨 Validate user_id exists
    if (!story.user_id) {
      console.error(`❌ Story ${story_id} has no user_id - cannot check credits`);
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

    const userId: string = story.user_id;

    // 💳 Check credit balance BEFORE starting (but deduct AFTER success)
    const currentBalance = await getUserCredits(userId);
    if (currentBalance < CREDIT_COSTS.VIDEO_GENERATION) {
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error: 'Insufficient credits' })
        .eq('id', jobId);
      return res.status(402).json({
        error: `Insufficient credits. You need ${CREDIT_COSTS.VIDEO_GENERATION} credit for video generation, but you only have ${currentBalance}.`,
        required_credits: CREDIT_COSTS.VIDEO_GENERATION,
        current_balance: currentBalance
      });
    }

    // ✅ RETURN IMMEDIATELY - Video generation will continue in background
    res.status(202).json({
      message: "Video generation started",
      job_id: jobId,
      story_id: story_id
    });

    // 🚀 RUN VIDEO GENERATION IN BACKGROUND (after response is sent)
    setImmediate(async () => {
      await runVideoGeneration({
        jobId: jobId!,
        storyId: story_id,
        aspectRatio: aspect_ratio,
        captions,
        backgroundMusic: background_music,
        userId,
        storyTitle: story.title
      });
    });

    return; // Exit handler - background job continues

  } catch (err: any) {
    console.error(`[${story_id}] Error starting video generation:`, err);
    if (jobId) {
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error: err.message || 'Unknown error' })
        .eq('id', jobId);
    }
    // Only send response if not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

// ============================================================================
// BACKGROUND VIDEO GENERATION FUNCTION
// ============================================================================

interface VideoGenParams {
  jobId: string;
  storyId: string;
  aspectRatio: string;
  captions: any;
  backgroundMusic: any;
  userId: string;
  storyTitle: string;
}

async function runVideoGeneration(params: VideoGenParams) {
  const { jobId, storyId: story_id, aspectRatio: aspect_ratio, captions, backgroundMusic: background_music, userId, storyTitle } = params;

  // Configure fontconfig to use project fonts directory
  const projectRoot = path.resolve(process.cwd());
  const fontConfigFile = path.join(projectRoot, 'fonts.conf');
  process.env.FONTCONFIG_FILE = fontConfigFile;

  const tmpDir = path.join(process.cwd(), "tmp", jobId);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    await updateJobProgress(jobId, 5);

    const logger = getUserLogger(userId);

    logger.info(`[${story_id}] 🎬 Starting background video generation (Job ID: ${jobId})`);
    logger.info(`[${story_id}] 📐 Aspect ratio: ${aspect_ratio || '9:16'}`);
    if (background_music?.enabled) {
      logger.info(`[${story_id}] 🎵 Background music enabled at ${background_music.volume}% volume`);
    }

    await updateJobProgress(jobId, 10);

    // 1️⃣ Fetch scenes with images, videos, audio, word timestamps, and effects
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, order, text, image_url, video_url, audio_url, word_timestamps, effects, duration")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found for this story");
    logger.info(`[${story_id}] 📚 Found ${scenes.length} scenes`);

    // Log media URLs for debugging
    scenes.forEach((s, i) => {
      logger.info(`[${story_id}] 📋 Scene ${i + 1}: video_url=${s.video_url ? 'YES' : 'NO'}, image_url=${s.image_url ? 'YES' : 'NO'}`);
    });

    await updateJobProgress(jobId, 15);

    const selectedAspect = aspect_ratio || "9:16";
    const aspectFolder = selectedAspect.replace(":", "-");

    // Preload overlay categories in a single query
    const overlayIds = Array.from(
      new Set(
        scenes
          .map((scene) => (scene.effects as any)?.overlay_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const overlayCategoryMap = new Map<string, string>();
    if (overlayIds.length > 0) {
      const { data: overlayRecords, error: overlayErr } = await supabaseAdmin
        .from("overlay_effects")
        .select("id, category")
        .in("id", overlayIds);

      if (overlayErr) {
        logger.warn(`[${story_id}] ⚠️ Failed to preload overlay metadata: ${overlayErr.message}`);
      } else if (overlayRecords) {
        overlayRecords.forEach((record) => {
          overlayCategoryMap.set(record.id, record.category || "other");
        });
      }
    }

    // 2️⃣ Verify media (images or videos) exist in scenes
    const scenesWithMedia = scenes.filter(s => s.image_url || s.video_url);
    logger.info(`[${story_id}] 🎬 Found ${scenesWithMedia.length} scenes with media out of ${scenes.length} total`);
    if (!scenesWithMedia.length) throw new Error("No media (images or videos) found for this story");

    // 3️⃣ Download all media files and get audio durations (parallel batches)
    type SceneMedia = {
      sceneIndex: number;
      duration: number;
      imagePath?: string;
      videoPath?: string;
      audioPath?: string;
      overlayPath?: string;
      overlayCategory?: string;
    };

    const mediaPathResults: SceneMedia[] = new Array(scenes.length);

    const resolveLocalOverlay = (overlayUrl: string | null | undefined, overlayId: string | null | undefined) => {
      if (!overlayUrl || !overlayId) return null;
      const fileName = overlayUrl.split("/").pop() || "";
      const overlayName = fileName.replace(/\.(webm|mp4)$/, "");
      const overlaysDir = path.join(process.cwd(), "public", "overlays");
      const candidates: string[] = [];

      if (aspectFolder === "1-1") {
        candidates.push(
          path.join(overlaysDir, `${overlayName}.mp4`),
          path.join(overlaysDir, `${overlayName}.webm`)
        );
      } else {
        candidates.push(
          path.join(overlaysDir, aspectFolder, `${overlayName}.mp4`),
          path.join(overlaysDir, aspectFolder, `${overlayName}.webm`)
        );
      }

      // Fallback to root overlays folder if aspect-specific file missing
      candidates.push(
        path.join(overlaysDir, `${overlayName}.mp4`),
        path.join(overlaysDir, `${overlayName}.webm`)
      );

      for (const candidatePath of candidates) {
        if (fs.existsSync(candidatePath)) {
          const localPathDisplay = aspectFolder === "1-1" ? overlayName : `${aspectFolder}/${overlayName}`;
          logger.info(`[${story_id}] ✅ Using local overlay: ${localPathDisplay} (${path.basename(candidatePath)})`);
          return {
            path: candidatePath,
            category: overlayCategoryMap.get(overlayId) || "other"
          };
        }
      }

      logger.warn(`[${story_id}] ⚠️ Local overlay not found: ${overlayName} for aspect ${aspectFolder}`);
      return null;
    };

    const downloadSceneMedia = async (scene: typeof scenes[number], index: number): Promise<SceneMedia> => {
      const sceneFiles: SceneMedia = { sceneIndex: index, duration: (scene as any).duration || 5 };

      // Download video or image
      if (scene.video_url) {
        try {
          const videoRes = await fetch(scene.video_url);
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
        }
      } else if (scene.image_url) {
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
        }
      } else {
        logger.info(`[${story_id}] 📝 Scene ${index + 1} has no media - will be text-only`);
      }

      if (scene.audio_url) {
        const audioRes = await fetch(scene.audio_url);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        const audioPath = path.join(tmpDir, `scene-${index}-audio.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);
        sceneFiles.audioPath = audioPath;
        logger.info(`[${story_id}] 🎵 Scene ${index + 1} audio downloaded`);
      }

      logger.info(`[${story_id}] ⏱️ Scene ${index + 1} duration: ${sceneFiles.duration.toFixed(2)}s`);

      const overlayUrl = (scene.effects as any)?.overlay_url;
      const overlayId = (scene.effects as any)?.overlay_id;
      const overlayInfo = resolveLocalOverlay(overlayUrl, overlayId);
      if (overlayInfo) {
        sceneFiles.overlayPath = overlayInfo.path;
        sceneFiles.overlayCategory = overlayInfo.category;
      }

      return sceneFiles;
    };

    const downloadConcurrency = 5;
    const activeDownloads = new Set<Promise<void>>();
    const downloadPromises: Promise<void>[] = [];

    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index];
      const downloadPromise = downloadSceneMedia(scene, index).then((sceneFiles) => {
        mediaPathResults[index] = sceneFiles;
      });
      activeDownloads.add(downloadPromise);
      downloadPromises.push(downloadPromise);
      downloadPromise.finally(() => activeDownloads.delete(downloadPromise));

      if (activeDownloads.size >= downloadConcurrency) {
        await Promise.race(activeDownloads);
      }
    }

    await Promise.all(downloadPromises);

    const mediaPaths = mediaPathResults.map((scene) => scene!);

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

    const dimensions = aspectRatioMap[selectedAspect] || aspectRatioMap["9:16"];
    const previewDimensions = previewDimensionsMap[selectedAspect] || previewDimensionsMap["9:16"];
    const width = dimensions.width;
    const height = dimensions.height;

    // Calculate font size scaling factor based on video width vs preview width
    const fontSizeScalingFactor = width / previewDimensions.width;

    logger.info(`[${story_id}] 🎞️ Rendering video at ${width}x${height} (${selectedAspect}), font scale: ${fontSizeScalingFactor.toFixed(2)}x`);

    // 8️⃣ Generate individual scene clips with precise timing and effects (PARALLEL)
    const videoClips: string[] = new Array(mediaPaths.length);
    const audioClips: string[] = new Array(mediaPaths.length);
    let completedScenes = 0;

    await updateJobProgress(jobId, 35);

    // Helper function to process a single scene
    const processScene = async (scene: typeof mediaPaths[0]) => {
      // Skip scenes without media (need either video or image)
      if (!scene.videoPath && !scene.imagePath) return;

      const clipPath = path.join(tmpDir, `clip-${scene.sceneIndex}.mp4`);
      if (fs.existsSync(clipPath)) {
        try {
          fs.unlinkSync(clipPath);
        } catch (err: any) {
          logger.warn(`[${story_id}] ⚠️ Failed to remove stale clip ${clipPath}: ${err.message}`);
        }
      }

      // Get effect for this scene
      const sceneData = scenes[scene.sceneIndex];
      const effectId = sceneData.effects?.motion || "none";
      const effect = getEffect(effectId);

      // 🎥 If scene has an uploaded video, use it directly
      if (scene.videoPath) {
        logger.info(`[${story_id}] 🎥 Scene ${scene.sceneIndex + 1}: Using uploaded video (${scene.duration.toFixed(2)}s)`);

        // Get source video duration to check if we need to extend
        const sourceVideoDuration = await new Promise<number>((resolve) => {
          ffmpeg.ffprobe(scene.videoPath!, (err, metadata) => {
            if (err || !metadata?.format?.duration) {
              resolve(10); // Default to 10s if can't probe
            } else {
              resolve(metadata.format.duration);
            }
          });
        });

        const requiredDuration = scene.duration;
        const needsExtension = sourceVideoDuration < requiredDuration;
        const extensionDuration = needsExtension ? requiredDuration - sourceVideoDuration : 0;

        if (needsExtension) {
          logger.info(`[${story_id}] 📏 Source video is ${sourceVideoDuration.toFixed(2)}s, need ${requiredDuration.toFixed(2)}s - extending last frame by ${extensionDuration.toFixed(2)}s`);
        }

        // Build video filters with high-quality lanczos upscaling for 4K
        const videoFilters = [
          `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`
        ];

        // Add tpad filter to extend with last frame if needed
        if (needsExtension) {
          videoFilters.push(`tpad=stop_mode=clone:stop_duration=${extensionDuration}`);
        }

        // Trim/resize video to match story dimensions and duration
        await new Promise<void>((resolve, reject) => {
          const cmd = ffmpeg(scene.videoPath!)
            .setStartTime(0)
            .videoFilters(videoFilters)
            .videoCodec('libx264')
            .noAudio() // Strip audio (already extracted separately during upload)
            .outputOptions([
              '-y',
              '-pix_fmt yuv420p',
              '-preset fast',
              '-crf 18',
            ]);

          // Only set duration if we're trimming (not extending)
          if (!needsExtension) {
            cmd.setDuration(scene.duration);
          }

          cmd.save(clipPath)
            .on('end', () => {
              logger.info(`[${story_id}] ✅ Scene ${scene.sceneIndex + 1} video processed to ${scene.duration.toFixed(2)}s${needsExtension ? ' (extended)' : ''}`);
              resolve();
            })
            .on('error', (err: any) => {
              logger.error(`[${story_id}] ❌ Error processing video for scene ${scene.sceneIndex + 1}: ${err.message}`);
              reject(err);
            });
        });

        videoClips[scene.sceneIndex] = clipPath;
        if (scene.audioPath) {
          audioClips[scene.sceneIndex] = scene.audioPath;
        }

        // Update progress
        completedScenes++;
        const sceneProgress = 35 + Math.floor(completedScenes / mediaPaths.length * 20);
        await updateJobProgress(jobId, sceneProgress);

        return; // Skip image processing for video clips
      }

      logger.info(`[${story_id}] 🎬 Scene ${scene.sceneIndex + 1}: Applying "${effect.name}" effect`);

      // Use FFmpeg zoompan filter for motion effects
      if (effectId !== "none" && scene.imagePath) {
        const effectFilter = effect.getFilter(width, height, scene.duration);
        logger.info(`[${story_id}] 🌀 Applying FFmpeg motion filter: ${effectFilter || "none"}`);

        const baseFilter = effectFilter
          ? `${effectFilter},setsar=1,format=gbrp`
          : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30,setsar=1,format=gbrp`;

        const overlayInfo = (scene as any).overlayPath
          ? {
              path: (scene as any).overlayPath,
              category: (scene as any).overlayCategory || "other",
            }
          : null;

        if (overlayInfo) {
          logger.info(`[${story_id}] 🎭 Applying overlay with FFmpeg zoompan: ${overlayInfo.path}`);
          const blendSettings = getOverlayBlendSettings(overlayInfo.category);
          logger.info(`[${story_id}]    Using ${blendSettings.blendMode} mode with ${blendSettings.opacity} opacity`);

          const compositeFilter =
            `[0:v]${baseFilter}[bg];` +
            `[1:v]fps=30,scale=${width}:${height}:flags=lanczos,setsar=1,format=gbrp[ov];` +
            `[bg][ov]blend=all_mode=${blendSettings.blendMode}:all_opacity=${blendSettings.opacity}[blended];` +
            `[blended]format=yuv420p[comp]`;

          const args = [
            "-i",
            scene.imagePath!,
            "-stream_loop",
            "-1",
            "-i",
            overlayInfo.path,
            "-y",
            "-filter_complex",
            compositeFilter,
            "-map",
            "[comp]",
            "-an",
            "-vcodec",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-t",
            `${scene.duration}`,
            "-r",
            "30",
            "-preset",
            "medium",
            "-crf",
            "15",
            clipPath,
          ];

          await runFFmpegCommand(args, logger, story_id);
          logger.info(`[${story_id}] ✅ Motion clip saved: ${clipPath}`);
        } else {
          await new Promise<void>((resolve, reject) => {
            const cmd = ffmpeg()
              .input(scene.imagePath!)
              .inputOptions(["-loop", "1", "-framerate", "15"]) // Loop image for duration
              .videoFilters(baseFilter)
              .noAudio()
              .videoCodec("libx264")
              .outputOptions([
                "-y",
                "-pix_fmt",
                "yuv420p",
                "-t",
                `${scene.duration}`,
                "-r",
                "30",
                "-preset",
                "medium",
                "-crf",
                "15",
              ])
              .save(clipPath)
              .on("end", () => {
                logger.info(`[${story_id}] ✅ Motion clip saved: ${clipPath}`);
                resolve();
              })
              .on("error", (err: any) => {
                logger.error(`[${story_id}] ❌ Motion effect failed: ${err.message}`);
                reject(err);
              });
          });
        }
      } else {
        // No motion effect - use static image with simple scaling

        // Skip scene if no image exists
        if (!scene.imagePath) {
          logger.warn(`[${story_id}] ⚠️ Scene ${scene.sceneIndex + 1} has no image - skipping video generation for this scene`);
          return;
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
            filterComplex =
              `[0:v]${videoFilter},fps=30,setsar=1,format=gbrp[bg];` +
              `[1:v]fps=30,scale=${width}:${height}:flags=lanczos,setsar=1,format=gbrp[ov];` +
              `[bg][ov]blend=all_mode=screen:all_opacity=1.0[blended];` +
              `[blended]format=yuv420p`;

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
                "-y",
                "-pix_fmt yuv420p",
                "-color_primaries bt709",
                "-color_trc bt709",
                "-colorspace bt709",
                `-t ${scene.duration}`,
                "-r 30",
                "-preset fast",
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
              .inputOptions(["-loop", "1", "-framerate", "15"]) // Loop image for duration
              .videoCodec("libx264")
              .noAudio()
              .outputOptions([
                "-y",
                "-pix_fmt yuv420p",
                `-vf ${videoFilter}`,
                `-t ${scene.duration}`,
                "-r 30", // Smooth playback for overlays
                "-preset fast", // Match effect clips preset
                "-crf 15", // Match effect clips quality
              ])
              .save(clipPath)
              .on("end", () => resolve())
              .on("error", (err: any) => reject(err));
          });
        }
      }

      videoClips[scene.sceneIndex] = clipPath;

      // If scene has audio, add it to audio clips list
      if (scene.audioPath) {
        audioClips[scene.sceneIndex] = scene.audioPath;
      }

      // Update progress for each scene processed (35-55% range)
      completedScenes++;
      const sceneProgress = 35 + Math.floor(completedScenes / mediaPaths.length * 20);
      await updateJobProgress(jobId, sceneProgress);
    };

    // Process scenes in parallel (max 5 at a time)
    logger.info(`[${story_id}] 🚀 Processing ${mediaPaths.length} scenes in parallel (max 5 concurrent)...`);
    const batchSize = 5;
    for (let i = 0; i < mediaPaths.length; i += batchSize) {
      const batch = mediaPaths.slice(i, i + batchSize);
      await Promise.all(batch.map(scene => processScene(scene)));
    }

    // Filter out undefined values (scenes that were skipped)
    const filteredVideoClips = videoClips.filter(c => c !== undefined);
    const filteredAudioClips = audioClips.filter(c => c !== undefined);

    logger.info(`[${story_id}] ✅ Generated ${filteredVideoClips.length} video clips in parallel`);

    await updateJobProgress(jobId, 55);
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
      logger.info(`[${story_id}] 🎬 Concatenating ${filteredVideoClips.length} video clips with concat filter...`);

      // Build FFmpeg command with each clip as a separate input
      let cmd = ffmpeg();
      filteredVideoClips.forEach((clipPath) => {
        cmd = cmd.input(clipPath);
      });

      // Build concat filter: [0:v][1:v]concat=n=2:v=1:a=0[concatv]
      const concatInputs = filteredVideoClips.map((_, i) => `[${i}:v]`).join('');
      const concatFilterStr = `${concatInputs}concat=n=${filteredVideoClips.length}:v=1:a=0[concatv]`;

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
          "-preset fast",
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

    // Determine storage path based on video type
    // Check if this is a UGC video by querying ugc_videos table
    const { data: ugcCheck } = await supabaseAdmin
      .from('ugc_videos')
      .select('id')
      .eq('id', story_id)
      .single();

    let fileName: string;
    const isUGCVideo = !!ugcCheck;

    if (isUGCVideo) {
      // UGC videos: {user_id}/ugc/{ugc_video_id}/video.mp4
      fileName = `${userId}/ugc/${story_id}/video.mp4`;
      logger.info(`[${story_id}] 📁 UGC video path: ${fileName}`);
    } else {
      // Regular stories: {user_id}/stories/{story_id}/video-{timestamp}.mp4
      fileName = `${userId}/stories/${story_id}/video-${Date.now()}.mp4`;
      logger.info(`[${story_id}] 📁 Story video path: ${fileName}`);
    }

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

    // 📹 If this is a UGC video, also update the ugc_videos table
    if (isUGCVideo) {
      const { error: ugcUpdateErr } = await supabaseAdmin
        .from('ugc_videos')
        .update({
          video_url: publicUrl,
          duration: totalDuration,
          status: 'completed'
        })
        .eq('id', story_id);

      if (ugcUpdateErr) {
        logger.warn(`[${story_id}] ⚠️ Failed to update UGC video record: ${ugcUpdateErr.message}`);
      } else {
        logger.info(`[${story_id}] ✅ Updated UGC video record with video URL`);
      }
    }

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
        `Video generation for story: ${storyTitle || story_id}`,
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

    // ✅ MARK JOB AS COMPLETED with video URL
    const { error: updateError } = await supabaseAdmin
      .from('video_generation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        video_url: publicUrl,
        duration: totalDuration
      })
      .eq('id', jobId);

    if (updateError) {
      logger.error(`[${story_id}] ❌ Failed to mark job as completed: ${updateError.message}`);
    } else {
      logger.info(`[${story_id}] ✅ Video generation job ${jobId} marked as completed`);
    }

    // Track analytics event
    await supabaseAdmin.from("analytics_events").insert({
      user_id: userId,
      event_name: 'video_generated',
      event_data: {
        story_id,
        duration: totalDuration,
        aspect_ratio: aspect_ratio || '9:16'
      }
    });

    // Cleanup temp directory
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        logger.info(`[${story_id}] 🧹 Cleaned up temp directory ${tmpDir}`);
      }
    } catch (cleanupErr: any) {
      console.error(`[${story_id}] ⚠️ Failed to cleanup temp directory: ${cleanupErr.message}`);
    }

  } catch (err: any) {
    console.error(`[${story_id}] Error generating video:`, err);

    // ❌ MARK JOB AS FAILED
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

    // Cleanup temp directory on error
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
function runFFmpegCommand(args: string[], logger: ReturnType<typeof getUserLogger>, storyId: string) {
  const finalArgs = [...args];
  if (!finalArgs.includes("-hide_banner")) {
    finalArgs.unshift("-hide_banner");
  }
  if (!finalArgs.includes("-loglevel")) {
    finalArgs.unshift("error");
    finalArgs.unshift("-loglevel");
  }

  return new Promise<void>((resolve, reject) => {
    logger.info(`[${storyId}] 🚀 ffmpeg ${finalArgs.join(" ")}`);
    const ff = spawn("ffmpeg", finalArgs, { stdio: ["ignore", "pipe", "pipe"] });

    ff.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        logger.info(`[${storyId}] ffmpeg: ${line}`);
      }
    });

    ff.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ff.on("error", (err) => {
      reject(err);
    });
  });
}
