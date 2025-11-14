import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import * as Echogarden from "echogarden";
import { getUserLogger } from "../../lib/userLogger";
import { getUserCredits, deductCredits, calculateVideoUploadCost } from "../../lib/credits";

// Helper to get video duration using ffprobe
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration || 0;
      resolve(duration);
    });
  });
}

// Helper to extract audio from video
async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(audioPath)
      .audioCodec('libmp3lame')
      .noVideo()
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper to transcribe audio with Echogarden (local, free)
async function transcribeWithEchogarden(audioPath: string): Promise<{
  text: string;
  word_timestamps: Array<{ word: string; start: number; end: number }>;
}> {
  const recognitionResult = await Echogarden.recognize(audioPath, {
    engine: 'whisper',
    language: 'en',
  });

  // Extract word timestamps from wordTimeline
  const word_timestamps = recognitionResult.wordTimeline?.map((entry: any) => ({
    word: entry.text,
    start: entry.startTime,
    end: entry.endTime
  })) || [];

  return {
    text: recognitionResult.transcript || '',
    word_timestamps,
  };
}

// 🔒 Security limits for YouTube video imports
const MAX_FILE_SIZE_MB = 200; // 200MB max (same as upload)
const MAX_DURATION_SECONDS = 300; // 5 minutes max

// Helper to download YouTube video using yt-dlp (SECURE - prevents command injection)
async function downloadYouTubeVideo(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 🔐 Validate URL format (defense in depth)
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(url)) {
      return reject(new Error('Invalid YouTube URL'));
    }

    // 🔐 Use spawn with args array instead of shell command (prevents command injection)
    const maxFilesizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    const args = [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', // Download video (mp4 format)
      '--merge-output-format', 'mp4',
      '--max-filesize', maxFilesizeBytes.toString(), // Limit file size
      '-o', outputPath,
      url
    ];

    console.log("📥 Downloading video from YouTube:", url);
    const process = spawn('yt-dlp', args);

    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log("✅ YouTube video download completed");
        resolve();
      } else {
        // Try youtube-dl as fallback
        console.log("⚠️ yt-dlp failed, trying youtube-dl...");
        const fallbackProcess = spawn('youtube-dl', args);

        fallbackProcess.on('close', (fallbackCode) => {
          if (fallbackCode === 0) {
            console.log("✅ YouTube video download completed with youtube-dl");
            resolve();
          } else {
            reject(new Error("Unable to import video from YouTube. Please check the URL and try again."));
          }
        });

        fallbackProcess.on('error', () => {
          reject(new Error("Unable to import video from YouTube. Please check the URL and try again."));
        });
      }
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let logger: any = null;
  let tempVideoPath: string | null = null;
  let tempAudioPath: string | null = null;
  let videoOnlyPath: string | null = null;
  let thumbnailPath: string | null = null;

  try {
    // 🔐 Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    const userId = user.id;
    logger = getUserLogger(userId);

    const { scene_id, youtube_url } = req.body;

    if (!scene_id) {
      return res.status(400).json({ error: "scene_id is required" });
    }

    if (!youtube_url) {
      return res.status(400).json({ error: "YouTube URL is required" });
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(youtube_url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    logger.info(`[Scene ${scene_id}] 📤 Starting YouTube video import`);
    logger.info(`[Scene ${scene_id}] User: ${user.email}`);
    logger.info(`[Scene ${scene_id}] URL: ${youtube_url}`);

    // 1️⃣ Fetch scene data
    const { data: scene, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, story_id, text")
      .eq("id", scene_id)
      .single();

    if (sceneErr || !scene) {
      throw new Error("Scene not found");
    }

    // 2️⃣ Download video from YouTube
    const tempFileBase = path.join(tmpdir(), `youtube-video-${Date.now()}`);
    tempVideoPath = `${tempFileBase}.mp4`;

    logger.info(`[Scene ${scene_id}] 📥 Downloading video from YouTube...`);
    await downloadYouTubeVideo(youtube_url, tempFileBase);

    // Check if file exists
    if (!fs.existsSync(tempVideoPath)) {
      throw new Error("Downloaded video file not found");
    }

    // 🔒 Validate file size (security check)
    const fileStats = fs.statSync(tempVideoPath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    logger.info(`[Scene ${scene_id}] 📦 File size: ${fileSizeMB.toFixed(2)}MB`);

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
      return res.status(400).json({
        error: `Video is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB (${fileSizeMB.toFixed(1)}MB detected).`
      });
    }

    // 3️⃣ Get video duration
    const duration = await getVideoDuration(tempVideoPath);
    logger.info(`[Scene ${scene_id}] ⏱️ Video duration: ${duration.toFixed(2)} seconds`);

    if (duration > MAX_DURATION_SECONDS) {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
      throw new Error(`Video is too long. Maximum duration is ${MAX_DURATION_SECONDS / 60} minutes.`);
    }

    // 4️⃣ Calculate credits needed based on duration
    const creditsNeeded = calculateVideoUploadCost(duration);
    logger.info(`[Scene ${scene_id}] 💳 Credits needed: ${creditsNeeded} (${Math.ceil(duration / 60)} min @ 3 credits/min)`);

    const currentBalance = await getUserCredits(userId);
    logger.info(`[Scene ${scene_id}] 💰 Current balance: ${currentBalance} credits`);

    if (currentBalance < creditsNeeded) {
      logger.warn(`[Scene ${scene_id}] ❌ Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`);
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credits for importing and transcribing a ${Math.ceil(duration / 60)} minute video (3 credits per minute), but you only have ${currentBalance}.`,
        required_credits: creditsNeeded,
        current_balance: currentBalance
      });
    }

    // 5️⃣ Create video-only version (strip audio track)
    if (!tempVideoPath) {
      throw new Error("Video file path is missing");
    }

    videoOnlyPath = path.join(tmpdir(), `scene-video-only-${scene_id}-${Date.now()}.mp4`);
    logger.info(`[Scene ${scene_id}] 🎬 Creating video-only file (removing audio track)...`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath!)
        .noAudio() // Strip audio track
        .videoCodec('copy') // Copy video as-is (fast, no re-encoding)
        .output(videoOnlyPath!)
        .on('end', () => {
          logger.info(`[Scene ${scene_id}] ✅ Video-only file created`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`[Scene ${scene_id}] ❌ Failed to create video-only file: ${err.message}`);
          reject(err);
        })
        .run();
    });

    // 6️⃣ Upload video-only file to Supabase Storage
    const videoBuffer = fs.readFileSync(videoOnlyPath);
    const videoFileName = `scene-video-${scene_id}-${Date.now()}.mp4`;

    logger.info(`[Scene ${scene_id}] ☁️ Uploading video-only file to Supabase Storage...`);
    const { error: uploadError } = await supabaseAdmin.storage
      .from("videos")
      .upload(videoFileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      logger.error(`[Scene ${scene_id}] ❌ Video upload error: ${uploadError.message}`);
      throw uploadError;
    }

    const videoUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${videoFileName}`;
    logger.info(`[Scene ${scene_id}] ✅ Video-only file uploaded: ${videoUrl}`);

    // 6.5️⃣ Extract best frame as thumbnail using FFmpeg thumbnail filter
    thumbnailPath = path.join(tmpdir(), `scene-thumbnail-${scene_id}-${Date.now()}.jpg`);
    logger.info(`[Scene ${scene_id}] 📸 Extracting best frame as thumbnail...`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath!)
        .outputOptions([
          '-vf', 'thumbnail=300,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2', // Analyze first 300 frames, pick best, then scale
          '-frames:v', '1' // Output only 1 frame
        ])
        .output(thumbnailPath!)
        .on('end', () => {
          logger.info(`[Scene ${scene_id}] ✅ Best frame thumbnail extracted`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`[Scene ${scene_id}] ❌ Failed to extract thumbnail: ${err.message}`);
          reject(err);
        })
        .run();
    });

    // Upload thumbnail to Supabase Storage
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailFileName = `scene-thumbnail-${scene_id}-${Date.now()}.jpg`;

    logger.info(`[Scene ${scene_id}] ☁️ Uploading thumbnail to Supabase Storage...`);
    const { error: thumbnailUploadError } = await supabaseAdmin.storage
      .from("images")
      .upload(thumbnailFileName, thumbnailBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (thumbnailUploadError) {
      logger.error(`[Scene ${scene_id}] ❌ Thumbnail upload error: ${thumbnailUploadError.message}`);
      // Don't fail the whole upload if thumbnail fails
    }

    const thumbnailUrl = thumbnailUploadError
      ? null
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/${thumbnailFileName}`;

    if (thumbnailUrl) {
      logger.info(`[Scene ${scene_id}] ✅ Thumbnail uploaded: ${thumbnailUrl}`);
    }

    // Cleanup thumbnail temp file
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }

    // 7️⃣ Extract audio from video
    tempAudioPath = path.join(tmpdir(), `scene-audio-${scene_id}-${Date.now()}.mp3`);
    logger.info(`[Scene ${scene_id}] 🎵 Extracting audio from video...`);
    await extractAudio(tempVideoPath, tempAudioPath);
    logger.info(`[Scene ${scene_id}] ✅ Audio extracted`);

    // 7️⃣ Recognize speech with Echogarden
    logger.info(`[Scene ${scene_id}] 🎙️ Recognizing speech with Echogarden (local Whisper engine)...`);
    const { text, word_timestamps } = await transcribeWithEchogarden(tempAudioPath);
    logger.info(`[Scene ${scene_id}] ✅ Recognition complete: "${text.substring(0, 100)}..."`);
    logger.info(`[Scene ${scene_id}] 📝 Generated ${word_timestamps.length} word timestamps`);

    // 8️⃣ Upload audio to Supabase Storage
    const audioBuffer = fs.readFileSync(tempAudioPath);
    const audioFileName = `scene-${scene_id}-${Date.now()}.mp3`;

    logger.info(`[Scene ${scene_id}] ☁️ Uploading audio to Supabase Storage...`);
    const { error: audioUploadError } = await supabaseAdmin.storage
      .from("audio")
      .upload(audioFileName, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (audioUploadError) {
      logger.error(`[Scene ${scene_id}] ❌ Audio upload error: ${audioUploadError.message}`);
      throw audioUploadError;
    }

    const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioFileName}`;
    logger.info(`[Scene ${scene_id}] ✅ Audio uploaded: ${audioUrl}`);

    // 9️⃣ Update scene with video, audio, transcript, word timestamps, and thumbnail
    logger.info(`[Scene ${scene_id}] 💾 Updating scene in database...`);
    const updateData: any = {
      video_url: videoUrl,
      audio_url: audioUrl,
      text: text, // Update with transcribed text
      duration: duration,
      word_timestamps: word_timestamps,
      last_modified_at: new Date().toISOString(),
    };

    // Add thumbnail if generated successfully
    if (thumbnailUrl) {
      updateData.image_url = thumbnailUrl;
    }

    const { error: updateError } = await supabaseAdmin
      .from("scenes")
      .update(updateData)
      .eq("id", scene_id);

    if (updateError) {
      logger.error(`[Scene ${scene_id}] ❌ Database update error: ${updateError.message}`);
      throw updateError;
    }

    logger.info(`[Scene ${scene_id}] ✅ Scene updated successfully`);

    // 🔟 Deduct credits AFTER successful import and transcription
    logger.info(`[Scene ${scene_id}] 💳 Deducting ${creditsNeeded} credits after successful import...`);
    const deductResult = await deductCredits(
      userId,
      creditsNeeded,
      'deduction_video_upload',
      `YouTube video import with transcription for scene in story: ${scene.story_id}`,
      scene.story_id
    );

    if (!deductResult.success) {
      logger.error(`[Scene ${scene_id}] ⚠️ Failed to deduct credits: ${deductResult.error}`);
      // Video was imported successfully, so we don't fail the request
    } else {
      logger.info(`[Scene ${scene_id}] ✅ Deducted ${creditsNeeded} credits. New balance: ${deductResult.newBalance}`);
    }

    // 🧹 Cleanup temp files
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }
    if (videoOnlyPath && fs.existsSync(videoOnlyPath)) {
      fs.unlinkSync(videoOnlyPath);
    }
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }

    logger.info(`[Scene ${scene_id}] 🎉 YouTube video import complete!`);

    return res.status(200).json({
      success: true,
      scene_id: scene_id,
      video_url: videoUrl,
      audio_url: audioUrl,
      text: text,
      duration: duration,
      word_timestamps: word_timestamps,
    });

  } catch (err: any) {
    if (logger) {
      logger.error(`❌ Error importing YouTube video: ${err.message}`);
    } else {
      console.error(`❌ Error importing YouTube video: ${err.message}`);
    }

    // 🧹 Cleanup temp files on error
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }
    if (videoOnlyPath && fs.existsSync(videoOnlyPath)) {
      fs.unlinkSync(videoOnlyPath);
    }
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }

    return res.status(500).json({ error: err.message || "Failed to import YouTube video" });
  }
}
