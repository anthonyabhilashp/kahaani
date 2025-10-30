import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { JobLogger } from "../../lib/logger";
import { generateWordByWordASS, type WordTimestamp } from "../../lib/assSubtitles";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";
import { getEffect } from "../../lib/videoEffects";
import { generateEffectFrames, cleanupFrames } from "../../lib/frameGenerator";
import { getUserCredits, deductCredits, refundCredits, CREDIT_COSTS } from "../../lib/credits";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// --- Helper to update job progress ---
async function updateJobProgress(jobId: string, progress: number) {
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

  let logger: JobLogger | null = null;
  let jobId: string | null = null;

  try {
    // 🚨 CHECK IF VIDEO GENERATION IS ALREADY IN PROGRESS
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

    logger = new JobLogger(story_id, "generate_video");
    logger.log(`🎬 Starting video generation for story: ${story_id} (Job ID: ${jobId})`);
    logger.log(`📐 Aspect ratio: ${aspect_ratio || '9:16'}`);
    if (background_music?.enabled) {
      logger.log(`🎵 Background music enabled at ${background_music.volume}% volume`);
    }

    // 💳 Credit check: Get user ID from story
    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("user_id, title")
      .eq("id", story_id)
      .single();

    if (storyError || !story) {
      throw new Error("Story not found");
    }

    const userId = story.user_id;
    logger.log(`👤 User ID: ${userId}`);

    // 💳 Check credit balance
    const currentBalance = await getUserCredits(userId);
    logger.log(`💰 Current balance: ${currentBalance} credits`);

    if (currentBalance < CREDIT_COSTS.VIDEO_GENERATION) {
      logger.log(`❌ Insufficient credits: need ${CREDIT_COSTS.VIDEO_GENERATION}, have ${currentBalance}`);

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

    // 💳 Deduct credits before starting generation
    const deductResult = await deductCredits(
      userId,
      CREDIT_COSTS.VIDEO_GENERATION,
      'deduction_video',
      `Video generation for story: ${story.title || story_id}`,
      story_id
    );

    if (!deductResult.success) {
      logger.log(`❌ Failed to deduct credits: ${deductResult.error}`);

      // Mark job as failed before returning
      await supabaseAdmin
        .from('video_generation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: 'Failed to deduct credits'
        })
        .eq('id', jobId);

      return res.status(500).json({ error: deductResult.error });
    }

    logger.log(`✅ Deducted ${CREDIT_COSTS.VIDEO_GENERATION} credit. New balance: ${deductResult.newBalance}`);

    const tmpDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    await updateJobProgress(jobId, 10);

    // 1️⃣ Fetch scenes with images, audio, word timestamps, and effects
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, order, text, image_url, audio_url, word_timestamps, effects")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found for this story");
    logger.log(`📚 Found ${scenes.length} scenes`);

    await updateJobProgress(jobId, 15);

    // 2️⃣ Verify images exist in scenes
    const scenesWithImages = scenes.filter(s => s.image_url);
    logger.log(`🖼️ Found ${scenesWithImages.length} scenes with images out of ${scenes.length} total`);
    if (!scenesWithImages.length) throw new Error("No images found for this story");

    // 3️⃣ Download all media files and get audio durations
    const mediaPaths: Array<{
      sceneIndex: number;
      duration: number;
      imagePath?: string;
      audioPath?: string;
    }> = [];

    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index];
      const sceneFiles: any = { sceneIndex: index, duration: 5 }; // Default 5 seconds if no audio

      // Download image
      if (scene.image_url) {
        const imgRes = await fetch(scene.image_url);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const imgPath = path.join(tmpDir, `scene-${index}.png`);
        fs.writeFileSync(imgPath, buf);
        sceneFiles.imagePath = imgPath;
      }

      // Download audio if exists and get its duration
      if (scene.audio_url) {
        const audioRes = await fetch(scene.audio_url);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        const audioPath = path.join(tmpDir, `scene-${index}-audio.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);
        sceneFiles.audioPath = audioPath;

        // Get actual audio duration using ffprobe
        const audioDuration = await getAudioDuration(audioPath);
        sceneFiles.duration = audioDuration;
        logger.log(`🎵 Scene ${index + 1} audio duration: ${audioDuration.toFixed(2)}s`);
      }

      mediaPaths.push(sceneFiles);
    }

    logger.log(`🖼️ Downloaded media for ${mediaPaths.length} scenes`);
    logger.log(`⏱️ Scene timing: ${mediaPaths.map(s => `Scene ${s.sceneIndex + 1}: ${s.duration.toFixed(2)}s`).join(', ')}`);

    await updateJobProgress(jobId, 30);

    // 6️⃣ Clean up old videos for this story
    const { data: oldVideos } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .eq("story_id", story_id);

    if (oldVideos?.length) {
      logger.log(`🧹 Cleaning up ${oldVideos.length} old video(s)...`);
      const paths = oldVideos.map((v) => v.video_url.split("/videos/")[1]);
      if (paths.length) {
        const { error: delErr } = await supabaseAdmin.storage.from("videos").remove(paths);
        if (delErr) logger.error("⚠️ Error deleting old videos", delErr);
      }
      await supabaseAdmin.from("videos").delete().eq("story_id", story_id);
    }

    // 7️⃣ Get video dimensions based on aspect ratio
    const aspectRatioMap: { [key: string]: { width: number; height: number } } = {
      "9:16": { width: 1080, height: 1920 },  // Portrait (mobile/TikTok)
      "16:9": { width: 1920, height: 1080 },  // Landscape (YouTube)
      "1:1": { width: 1080, height: 1080 }    // Square (Instagram)
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

    logger.log(`🎞️ Rendering video at ${width}x${height} (${selectedAspect}), font scale: ${fontSizeScalingFactor.toFixed(2)}x`);

    // 8️⃣ Generate individual scene clips with precise timing and effects
    const videoClips: string[] = [];
    const audioClips: string[] = [];
    const frameDirsToCleanup: string[] = [];

    await updateJobProgress(jobId, 35);

    for (const scene of mediaPaths) {
      if (!scene.imagePath) continue; // Skip scenes without images

      const clipPath = path.join(tmpDir, `clip-${scene.sceneIndex}.mp4`);

      // Get effect for this scene
      const sceneData = scenes[scene.sceneIndex];
      const effectId = sceneData.effects?.motion || "none";
      const effect = getEffect(effectId);

      logger.log(`🎬 Scene ${scene.sceneIndex + 1}: Applying "${effect.name}" effect`);

      // Use frame-by-frame rendering for smooth effects
      if (effectId !== "none") {
        const framesDir = path.join(tmpDir, `frames-${scene.sceneIndex}`);
        frameDirsToCleanup.push(framesDir);

        logger.log(`🖼️ Generating smooth frames at 15fps...`);

        await generateEffectFrames({
          imagePath: scene.imagePath,
          outputDir: framesDir,
          width,
          height,
          duration: scene.duration,
          effectType: effectId,
          fps: 15, // Lower FPS = much faster, still smooth
        });

        logger.log(`✅ Frames generated, encoding video...`);

        // Create video from PNG frames (lossless quality)
        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(path.join(framesDir, "frame_%06d.png"))
            .inputOptions(["-framerate 15"])
            .videoCodec("libx264")
            .noAudio()
            .outputOptions([
              "-pix_fmt yuv420p",
              "-preset medium", // Better quality encoding
              "-crf 15", // Very high quality (lower = better)
            ])
            .save(clipPath)
            .on("end", () => resolve())
            .on("error", (err: any) => reject(err));
        });

      } else {
        // No effect - use static image with simple scaling
        const videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;

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
              "-r 15", // Set output framerate to match effect clips
              "-preset medium", // Match effect clips preset
              "-crf 15", // Match effect clips quality
            ])
            .save(clipPath)
            .on("end", () => resolve())
            .on("error", (err: any) => reject(err));
        });
      }

      videoClips.push(`file '${clipPath}'`);

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
    logger.log(`🧹 Cleaning up ${frameDirsToCleanup.length} frame directories...`);
    for (const framesDir of frameDirsToCleanup) {
      try {
        cleanupFrames(framesDir);
      } catch (err) {
        logger.error(`⚠️ Failed to cleanup ${framesDir}`, err);
      }
    }

    await updateJobProgress(jobId, 60);

    // 9️⃣ Combine all video clips
    const concatTxt = path.join(tmpDir, "video-concat.txt");
    fs.writeFileSync(concatTxt, videoClips.join("\n"));

    const videoOnlyPath = path.join(tmpDir, `video-only-${story_id}.mp4`);

    // If captions are enabled, generate ASS subtitle file with word-by-word animation
    let captionFilter = "";
    if (captions?.enabled) {
      logger.log(`🎨 Generating captions with style: ${captions.style}, position: ${captions.position}`);

      // Collect all word timestamps from all scenes
      const allWordTimestamps: WordTimestamp[] = [];
      let timeOffset = 0;

      for (const scene of mediaPaths) {
        const sceneData = scenes[scene.sceneIndex];
        if (sceneData.word_timestamps && Array.isArray(sceneData.word_timestamps)) {
          // Add timestamps with offset for this scene's position in video
          sceneData.word_timestamps.forEach((wt: any) => {
            allWordTimestamps.push({
              word: wt.word,
              start: wt.start + timeOffset,
              end: wt.end + timeOffset
            });
          });
        }
        timeOffset += scene.duration;
      }

      logger.log(`📝 Collected ${allWordTimestamps.length} word timestamps from ${mediaPaths.length} scenes`);

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

        const assStyle: any = {
          name: 'Custom',
          fontName: captions.fontFamily || 'Montserrat',
          fontSize: scaledFontSize,
          primaryColour: convertHexToASSColor(captions.inactiveColor || '#FFFFFF'),
          bold: captions.fontWeight >= 600 ? 1 : 0,
          italic: 0,
          outline: 3,
          shadow: 2,
          alignment: 2, // Bottom center
          marginV: marginV,
        };

        logger.log(`📏 Font size: ${previewFontSize}px (preview) → ${scaledFontSize}pt (video) [${fontSizeScalingFactor.toFixed(2)}x scale]`);

        // Generate ASS with word-by-word animation and custom highlight color
        const highlightColor = convertHexToASSColor(captions.activeColor || '#FFEB3B');
        const wordsPerBatch = captions.wordsPerBatch || 0; // 0 = show all words
        const textTransform = captions.textTransform || 'none';

        const assContent = generateWordByWordASS(
          allWordTimestamps,
          assStyle,
          highlightColor,
          wordsPerBatch,
          textTransform
        );
        fs.writeFileSync(assPath, assContent);
        logger.log(`✅ Generated word-by-word ASS subtitles with ${wordsPerBatch > 0 ? wordsPerBatch + ' words per batch' : 'all words'}, transform: ${textTransform}`);
      } else {
        // Fallback to simple SRT if no word timestamps
        logger.log(`⚠️ No word timestamps available, using simple scene-level captions`);
        const srtPath = path.join(tmpDir, `subtitles-${story_id}.srt`);
        generateSRTFile(
          mediaPaths.map(scene => ({ text: scenes[scene.sceneIndex].text, duration: scene.duration })),
          srtPath
        );
        // Convert SRT to ASS for consistency (will use simple display)
        // For now, just use SRT path
        logger.log(`✅ Generated simple SRT subtitles: ${srtPath}`);
      }

      // Escape the ASS path for FFmpeg
      const escapedAssPath = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\\\:');
      captionFilter = escapedAssPath;

      logger.log(`📝 Caption file ready: ${assPath}`);
    }

    await new Promise<void>((resolve, reject) => {
      const outputOpts = [
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
      ];

      // Add caption filter if enabled (using ASS file)
      if (captionFilter) {
        outputOpts.push(`-vf subtitles='${captionFilter}'`);
      }

      ffmpeg()
        .input(concatTxt)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(outputOpts)
        .save(videoOnlyPath)
        .on("end", () => resolve())
        .on("error", reject);
    });

    await updateJobProgress(jobId, 75);

    // 🔟 Create final video - video already has correct timing, just add audio track
    const finalVideo = path.join(tmpDir, `final-video-${story_id}.mp4`);

    // Concat all scene audio files into one track
    const hasAudio = mediaPaths.some(s => s.audioPath);

    if (hasAudio) {
      // Create concat file for audio
      const audioConcat = path.join(tmpDir, "audio-concat.txt");
      const audioFiles = mediaPaths
        .map(s => s.audioPath)
        .filter(Boolean)
        .map(p => `file '${p}'`);
      fs.writeFileSync(audioConcat, audioFiles.join("\n"));

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

      logger.log("🎵 Concatenated all scene audio files with normalization (85% volume + gentle compression for clarity)");

      let finalAudioTrack = mergedNarrationAudio;

      // Mix background music if enabled
      if (background_music?.enabled && background_music?.music_url) {
        logger.log("🎵 Downloading background music...");

        const bgMusicPath = path.join(tmpDir, "background-music.mp3");
        const bgRes = await fetch(background_music.music_url);
        const bgBuffer = Buffer.from(await bgRes.arrayBuffer());
        fs.writeFileSync(bgMusicPath, bgBuffer);

        // Get total video duration
        const totalDuration = mediaPaths.reduce((sum, scene) => sum + scene.duration, 0);
        const bgVolume = (background_music.volume || 30) / 100; // Convert percentage to 0-1 scale
        const narrationVolume = 1.0; // Narration already normalized in concat step

        logger.log(`🎵 Mixing background music (${background_music.volume}% volume) with narration for ${totalDuration.toFixed(2)}s`);

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

          cmd.on("start", (cmdLine) => logger?.log(`🚀 FFmpeg mixing: ${cmdLine}`));
          cmd.on("end", () => {
            logger?.log("✅ Background music mixed with narration");
            resolve();
          });
          cmd.on("error", (err) => {
            logger?.error("❌ FFmpeg mixing failed", err);
            reject(err);
          });
        });

        finalAudioTrack = mixedAudio;
      }

      // Combine video with final audio track
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
          .on("start", (cmd: any) => logger?.log(`🚀 FFmpeg final merge: ${cmd}`))
          .on("end", () => {
            logger?.log("✅ Final video with audio track created");
            resolve();
          })
          .on("error", (err: any) => {
            logger?.error("❌ FFmpeg failed", err);
            reject(err);
          });
      });
    } else {
      // No audio, just use video as is
      fs.copyFileSync(videoOnlyPath, finalVideo);
      logger.log("✅ Video-only (no audio)");
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

    logger.log(`☁️ Uploaded video → ${publicUrl} (${totalDuration.toFixed(1)}s total)`);

    await updateJobProgress(jobId, 95);

    // Update story metadata (completion status)
    logger.log(`📊 Updating story metadata...`);
    await updateStoryMetadata(story_id);
    logger.log(`✅ Story metadata updated`);

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
      logger.log(`✅ Video generation job ${jobId} marked as completed`);
    }

    res.status(200).json({ story_id, video_url: publicUrl, duration: totalDuration, is_valid: true, job_id: jobId });
  } catch (err: any) {
    if (logger) logger.error("❌ Error generating video", err);

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

    // 💳 Auto-refund credits if generation failed
    try {
      // Get user ID from story for refund
      const { data: story } = await supabaseAdmin
        .from("stories")
        .select("user_id, title")
        .eq("id", story_id)
        .single();

      if (story && story.user_id) {
        logger?.log(`💸 Refunding ${CREDIT_COSTS.VIDEO_GENERATION} credit due to generation failure...`);
        const refundResult = await refundCredits(
          story.user_id,
          CREDIT_COSTS.VIDEO_GENERATION,
          `Refund: Video generation failed for story ${story.title || story_id}`,
          story_id
        );

        if (refundResult.success) {
          logger?.log(`✅ Refunded ${CREDIT_COSTS.VIDEO_GENERATION} credit. New balance: ${refundResult.newBalance}`);
        } else {
          logger?.error(`❌ Failed to refund credits`);
        }
      }
    } catch (refundErr: any) {
      logger?.error(`❌ Error during refund process: ${refundErr.message}`);
    }

    res.status(500).json({ error: err.message });
  }
}
