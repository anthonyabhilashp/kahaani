import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { getUserLogger } from "../../lib/userLogger";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Helper to download video from URL
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download video: ${response.statusText}`);

  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
}

// Helper to cut video segment using FFmpeg
async function cutVideoSegment(
  inputPath: string,
  outputPath: string,
  start: number,
  end: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(end - start)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart', // Enable streaming
      ])
      .on('start', (cmd) => {
        console.log('FFmpeg command:', cmd);
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    video_url,
    start,
    end,
    title,
    story_id,
    scene_id
  } = req.body;

  if (!video_url || start === undefined || end === undefined) {
    return res.status(400).json({ error: 'video_url, start, and end are required' });
  }

  if (end <= start) {
    return res.status(400).json({ error: 'end must be greater than start' });
  }

  const duration = end - start;
  if (duration < 5 || duration > 120) {
    return res.status(400).json({ error: 'Short duration must be between 5 and 120 seconds' });
  }

  const logger = getUserLogger(story_id || 'shorts_cut');
  const tempDir = path.join(tmpdir(), `cut_${Date.now()}`);
  const shortId = uuidv4();

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

    logger.info(`✂️ Cutting short: ${start.toFixed(1)}s - ${end.toFixed(1)}s (${duration.toFixed(1)}s)`);

    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, 'input.mp4');
    const outputPath = path.join(tempDir, `short_${shortId}.mp4`);

    // Download source video
    logger.info(`📥 Downloading source video...`);
    await downloadVideo(video_url, inputPath);

    // Cut the segment
    logger.info(`✂️ Cutting video segment...`);
    await cutVideoSegment(inputPath, outputPath, start, end);

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Failed to generate short video');
    }

    const fileStats = fs.statSync(outputPath);
    logger.info(`✅ Short generated: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Upload to Supabase Storage
    const fileName = `${user.id}/shorts/${shortId}.mp4`;
    const fileBuffer = fs.readFileSync(outputPath);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('videos')
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload short: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('videos')
      .getPublicUrl(fileName);

    logger.info(`📤 Uploaded short to: ${publicUrl}`);

    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn('Failed to cleanup temp files');
    }

    // Track analytics
    await supabaseAdmin.from("analytics_events").insert({
      user_id: user.id,
      event_name: 'short_created',
      event_data: {
        story_id,
        scene_id,
        short_id: shortId,
        duration,
        title
      }
    });

    res.status(200).json({
      success: true,
      short_id: shortId,
      video_url: publicUrl,
      duration,
      title,
      start,
      end
    });

  } catch (err: any) {
    logger.error(`❌ Error cutting short: ${err.message}`);

    // Cleanup temp files on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    res.status(500).json({ error: err.message });
  }
}
