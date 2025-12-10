import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { spawn } from "child_process";
import { getUserLogger } from "../../../lib/userLogger";
import fs from "fs";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const COOKIES_PATH = '/root/cookies.txt';

// Extract YouTube video ID from URL
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get video metadata using yt-dlp (title, duration, aspect ratio) - NO download
async function getYouTubeMetadata(url: string): Promise<{ title: string; duration: number; aspectRatio: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', '%(title)s',
      '--print', '%(duration)s',
      '--print', '%(width)s',
      '--print', '%(height)s',
      '--no-download',
      '--no-warnings',
    ];

    args.push(url);

    console.log("📊 Fetching YouTube metadata...");
    const process = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        const lines = stdout.trim().split('\n');
        const title = lines[0] || 'YouTube Video';
        const duration = parseFloat(lines[1]) || 0;
        const width = parseFloat(lines[2]) || 1920;
        const height = parseFloat(lines[3]) || 1080;

        // Determine aspect ratio category
        const ratio = width / height;
        let aspectRatio = '16:9'; // default
        if (ratio < 0.7) {
          aspectRatio = '9:16'; // Portrait (vertical)
        } else if (ratio > 1.4) {
          aspectRatio = '16:9'; // Landscape (horizontal)
        } else {
          aspectRatio = '1:1'; // Square-ish
        }

        console.log(`✅ Metadata: "${title}", ${duration}s, ${width}x${height} (${aspectRatio})`);
        resolve({ title, duration, aspectRatio });
      } else {
        console.error("❌ yt-dlp metadata failed:", stderr);
        // Check if it's a bot detection issue
        if (stderr.includes('Sign in to confirm') || stderr.includes('bot')) {
          reject(new Error('YouTube is blocking this request. Try a different video or try again later.'));
        } else {
          reject(new Error(`Failed to get YouTube metadata: ${stderr || 'Unknown error'}`));
        }
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

    const { youtube_url, title: customTitle } = req.body;

    if (!youtube_url) {
      return res.status(400).json({ error: "YouTube URL is required" });
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(youtube_url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // Extract video ID for thumbnail
    const videoId = extractYouTubeVideoId(youtube_url);
    if (!videoId) {
      return res.status(400).json({ error: "Could not extract YouTube video ID" });
    }

    if (logger) { logger.info(`📤 Starting YouTube import (lightweight)`); }
    if (logger) { logger.info(`User: ${user.email}`); }
    if (logger) { logger.info(`URL: ${youtube_url}`); }

    // 1️⃣ Get video metadata (title, duration, aspect ratio) - NO download
    const { title: ytTitle, duration, aspectRatio } = await getYouTubeMetadata(youtube_url);
    if (logger) { logger.info(`⏱️ Video duration: ${duration.toFixed(2)} seconds, aspect ratio: ${aspectRatio}`); }

    // 2️⃣ Use YouTube's thumbnail directly (no extraction needed)
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    if (logger) { logger.info(`🖼️ Using YouTube thumbnail: ${thumbnailUrl}`); }

    // 3️⃣ Insert into cut_short_videos table (audio downloaded later when generating captions)
    if (logger) { logger.info(`💾 Inserting into cut_short_videos table...`); }

    const { data: insertedVideo, error: insertError } = await supabaseAdmin
      .from("cut_short_videos")
      .insert({
        user_id: userId,
        title: customTitle || ytTitle || "YouTube Import",
        video_url: null,
        youtube_url: youtube_url,
        audio_url: null,  // Audio downloaded later when generating captions
        thumbnail_url: thumbnailUrl,
        duration: duration,
        aspect_ratio: aspectRatio,
      })
      .select()
      .single();

    if (insertError) {
      if (logger) { logger.error(`❌ Database insert error: ${insertError.message}`); }
      throw insertError;
    }

    if (logger) { logger.info(`✅ Cut short video created with ID: ${insertedVideo.id}`); }
    if (logger) { logger.info(`🎉 YouTube import complete!`); }

    return res.status(200).json({
      success: true,
      cut_short_video: insertedVideo,
    });

  } catch (err: any) {
    const errorMsg = err.message || "Unknown error";
    const errorStack = err.stack || "";

    console.error(`❌ Error importing YouTube video: ${errorMsg}`);
    console.error(`Stack: ${errorStack}`);

    if (logger) {
      logger.error(`❌ Error importing YouTube video: ${errorMsg}`);
      logger.error(`Stack: ${errorStack}`);
    }

    return res.status(500).json({ error: errorMsg || "Failed to import YouTube video" });
  }
}
