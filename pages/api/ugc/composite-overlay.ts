import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    ugc_video_id,
    background_video_url,
    avatar_video_url,
    overlay_position = 'bottom-right',
    overlay_size = 35
  } = req.body;

  if (!ugc_video_id || !background_video_url || !avatar_video_url) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  let logger: any = null;
  const tmpDir = path.join(process.cwd(), 'tmp', ugc_video_id);

  try {
    // 🔐 Get authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    logger = getUserLogger(user.id);
    logger.info(`[UGC] Compositing overlay for: ${ugc_video_id}`);

    // 🔒 Verify ownership
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('id, user_id')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      logger.error(`Video not found: ${videoError?.message}`);
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Create temp directory
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Download videos
    logger.info("Downloading background video...");
    const bgPath = path.join(tmpDir, 'background.mp4');
    const bgResponse = await fetch(background_video_url);
    const bgBuffer = Buffer.from(await bgResponse.arrayBuffer());
    fs.writeFileSync(bgPath, bgBuffer);

    logger.info("Downloading avatar video...");
    const avatarPath = path.join(tmpDir, 'avatar.mp4');
    const avatarResponse = await fetch(avatar_video_url);
    const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
    fs.writeFileSync(avatarPath, avatarBuffer);

    // Get video dimensions
    const bgInfo: any = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(bgPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });

    const bgWidth = bgInfo.streams[0].width;
    const bgHeight = bgInfo.streams[0].height;
    const bgDuration = bgInfo.format.duration;

    logger.info(`Background: ${bgWidth}x${bgHeight}, ${bgDuration}s`);

    // Calculate overlay dimensions and position
    const overlayWidth = Math.floor(bgWidth * (overlay_size / 100));
    const overlayHeight = Math.floor((overlayWidth * 16) / 9); // Assuming 9:16 avatar video

    // Position mapping
    const positions: { [key: string]: string } = {
      'top-left': '10:10',
      'top-center': `(W-${overlayWidth})/2:10`,
      'top-right': `W-${overlayWidth}-10:10`,
      'center-left': `10:(H-${overlayHeight})/2`,
      'center': `(W-${overlayWidth})/2:(H-${overlayHeight})/2`,
      'center-right': `W-${overlayWidth}-10:(H-${overlayHeight})/2`,
      'bottom-left': `10:H-${overlayHeight}-10`,
      'bottom-center': `(W-${overlayWidth})/2:H-${overlayHeight}-10`,
      'bottom-right': `W-${overlayWidth}-10:H-${overlayHeight}-10`
    };

    const overlayPos = positions[overlay_position] || positions['bottom-right'];

    logger.info(`Overlay: ${overlayWidth}x${overlayHeight} at ${overlay_position} (${overlayPos})`);

    // Composite videos using FFmpeg
    const outputPath = path.join(tmpDir, 'final-composite.mp4');

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(bgPath)
        .input(avatarPath)
        .setDuration(bgDuration) // Match background duration
        .complexFilter([
          // Scale avatar to overlay size
          `[1:v]scale=${overlayWidth}:${overlayHeight}[overlay]`,
          // Overlay avatar on background
          `[0:v][overlay]overlay=${overlayPos}`
        ])
        .audioCodec('aac')
        .videoCodec('libx264')
        .outputOptions([
          '-preset fast',
          '-crf 20',
          '-pix_fmt yuv420p'
        ])
        .on('start', (cmd) => {
          logger.info(`FFmpeg command: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.info(`Progress: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          logger.info('Compositing complete');
          resolve(true);
        })
        .on('error', (err) => {
          logger.error(`FFmpeg error: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    });

    // Upload to Supabase Storage
    logger.info("Uploading final video to Supabase...");
    const finalVideoBuffer = fs.readFileSync(outputPath);
    const fileName = `ugc-${ugc_video_id}-${Date.now()}.mp4`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('videos')
      .upload(fileName, finalVideoBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (uploadError) {
      logger.error(`Upload error: ${uploadError.message}`);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('videos')
      .getPublicUrl(fileName);

    logger.info(`✓ Video uploaded: ${publicUrl}`);

    // Update database
    const { error: updateError } = await supabaseAdmin
      .from('ugc_videos')
      .update({
        video_url: publicUrl,
        status: 'completed'
      })
      .eq('id', ugc_video_id);

    if (updateError) {
      logger.error(`Failed to update video URL: ${updateError.message}`);
    }

    // Cleanup temp files
    logger.info("Cleaning up temp files...");
    try {
      fs.unlinkSync(bgPath);
      fs.unlinkSync(avatarPath);
      fs.unlinkSync(outputPath);
      fs.rmdirSync(tmpDir);
    } catch (cleanupError: any) {
      logger.error(`Cleanup error: ${cleanupError.message}`);
    }

    logger.info(`✅ Overlay compositing complete`);

    return res.status(200).json({
      success: true,
      ugc_video_id,
      video_url: publicUrl
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Overlay compositing failed: ${error.message}`);
      logger.error(error.stack);
    }

    // Cleanup on error
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (cleanupError: any) {
      logger?.error(`Cleanup error: ${cleanupError.message}`);
    }

    return res.status(500).json({
      error: "Failed to composite overlay",
      details: error.message
    });
  }
}
