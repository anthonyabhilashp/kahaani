import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { getUserLogger } from "../../../lib/userLogger";
import { getUserCredits, deductCredits, calculateVideoUploadCost } from "../../../lib/credits";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

// Helper to get video metadata (duration, aspect ratio) using ffprobe
async function getVideoMetadata(filePath: string): Promise<{ duration: number; aspectRatio: string }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration || 0;

      // Get video stream to determine aspect ratio
      const videoStream = data?.streams?.find((s: any) => s.codec_type === 'video');
      let aspectRatio = '16:9'; // default

      if (videoStream?.width && videoStream?.height) {
        const width = videoStream.width;
        const height = videoStream.height;
        const ratio = width / height;

        // Determine aspect ratio category
        if (ratio < 0.7) {
          aspectRatio = '9:16'; // Portrait (vertical)
        } else if (ratio > 1.4) {
          aspectRatio = '16:9'; // Landscape (horizontal)
        } else {
          aspectRatio = '1:1'; // Square-ish
        }
      }

      resolve({ duration, aspectRatio });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let logger: any = null;
  let tempVideoPath: string | null = null;
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

    // Parse form data
    const form = formidable({
      maxFileSize: 200 * 1024 * 1024, // 200MB max
      keepExtensions: true,
    });

    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const title = Array.isArray(fields.title) ? fields.title[0] : fields.title;
    const videoFile = Array.isArray(files.video) ? files.video[0] : files.video;

    if (!videoFile) {
      return res.status(400).json({ error: "video file is required" });
    }

    if (logger) { logger.info(`📤 Starting cut short video upload`); }
    if (logger) { logger.info(`User: ${user.email}`); }
    if (logger) { logger.info(`File: ${videoFile.originalFilename}, Size: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`); }

    // 1️⃣ Get video metadata (duration + aspect ratio)
    tempVideoPath = videoFile.filepath;
    const { duration, aspectRatio } = await getVideoMetadata(tempVideoPath);

    if (logger) { logger.info(`⏱️ Video duration: ${duration.toFixed(2)} seconds, aspect ratio: ${aspectRatio}`); }

    // 2️⃣ Calculate credits needed based on duration
    const creditsNeeded = calculateVideoUploadCost(duration);
    if (logger) { logger.info(`💳 Credits needed: ${creditsNeeded} (${Math.ceil(duration / 60)} min @ 3 credits/min)`); }

    const currentBalance = await getUserCredits(userId);
    if (logger) { logger.info(`💰 Current balance: ${currentBalance} credits`); }

    if (currentBalance < creditsNeeded) {
      if (logger) { logger.warn(`❌ Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`); }
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credits for uploading a ${Math.ceil(duration / 60)} minute video (3 credits per minute), but you only have ${currentBalance}.`,
        required_credits: creditsNeeded,
        current_balance: currentBalance
      });
    }

    // 3️⃣ Upload original video (with audio intact) to Supabase Storage
    const videoId = crypto.randomUUID();
    const videoBuffer = fs.readFileSync(tempVideoPath);
    const videoFileName = `${userId}/cut-short-${videoId}-${Date.now()}.mp4`;

    if (logger) { logger.info(`☁️ Uploading video file to Supabase Storage...`); }
    const { error: uploadError } = await supabaseAdmin.storage
      .from("videos")
      .upload(videoFileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      if (logger) { logger.error(`❌ Video upload error: ${uploadError.message}`); }
      throw uploadError;
    }

    const videoUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${videoFileName}`;
    if (logger) { logger.info(`✅ Video uploaded: ${videoUrl}`); }

    // 4️⃣ Extract frame as thumbnail (at 1 second mark)
    thumbnailPath = path.join(tmpdir(), `cut-short-thumbnail-${videoId}-${Date.now()}.jpg`);
    if (logger) { logger.info(`📸 Extracting thumbnail frame...`); }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath!)
        .seekInput(1) // Seek to 1 second
        .frames(1)
        .size('1080x?') // Scale width to 1080, maintain aspect ratio
        .output(thumbnailPath!)
        .on('end', () => {
          if (logger) { logger.info(`✅ Thumbnail extracted`); }
          resolve();
        })
        .on('error', (err) => {
          if (logger) { logger.error(`❌ Failed to extract thumbnail: ${err.message}`); }
          reject(err);
        })
        .run();
    });

    // Upload thumbnail to Supabase Storage
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailFileName = `${userId}/cut-short-thumbnail-${videoId}-${Date.now()}.jpg`;

    if (logger) { logger.info(`☁️ Uploading thumbnail to Supabase Storage...`); }
    const { error: thumbnailUploadError } = await supabaseAdmin.storage
      .from("images")
      .upload(thumbnailFileName, thumbnailBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    const thumbnailUrl = thumbnailUploadError
      ? null
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/${thumbnailFileName}`;

    if (thumbnailUrl) {
      if (logger) { logger.info(`✅ Thumbnail uploaded: ${thumbnailUrl}`); }
    }

    // Cleanup thumbnail temp file
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }

    // 5️⃣ Insert into cut_short_videos table
    // Note: No audio_url stored - audio will be extracted on-demand during analysis
    if (logger) { logger.info(`💾 Inserting into cut_short_videos table...`); }

    const { data: insertedVideo, error: insertError } = await supabaseAdmin
      .from("cut_short_videos")
      .insert({
        user_id: userId,
        title: title || videoFile.originalFilename?.replace(/\.[^/.]+$/, "") || "Untitled",
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration: duration,
        aspect_ratio: aspectRatio,
        // text and word_timestamps will be populated during analysis
      })
      .select()
      .single();

    if (insertError) {
      if (logger) { logger.error(`❌ Database insert error: ${insertError.message}`); }
      throw insertError;
    }

    if (logger) { logger.info(`✅ Cut short video created with ID: ${insertedVideo.id}`); }

    // 6️⃣ Deduct credits AFTER successful upload
    if (logger) { logger.info(`💳 Deducting ${creditsNeeded} credits after successful upload...`); }
    const deductResult = await deductCredits(
      userId,
      creditsNeeded,
      'deduction_video_upload',
      `Cut short video upload: ${insertedVideo.title}`,
      undefined // No story_id for cut shorts
    );

    if (!deductResult.success) {
      if (logger) { logger.error(`⚠️ Failed to deduct credits: ${deductResult.error}`); }
    } else {
      if (logger) { logger.info(`✅ Deducted ${creditsNeeded} credits. New balance: ${deductResult.newBalance}`); }
    }

    // 🧹 Cleanup temp files
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }

    if (logger) { logger.info(`🎉 Cut short video upload complete!`); }

    return res.status(200).json({
      success: true,
      cut_short_video: insertedVideo,
    });

  } catch (err: any) {
    if (logger) {
      logger.error(`❌ Error uploading cut short video: ${err.message}`);
    } else {
      console.error(`❌ Error uploading cut short video: ${err.message}`);
    }

    // 🧹 Cleanup temp files on error
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }

    return res.status(500).json({ error: err.message || "Failed to upload video" });
  }
}
