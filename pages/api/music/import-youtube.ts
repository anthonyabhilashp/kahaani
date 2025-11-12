import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import { checkRateLimit, RateLimits } from "@/lib/rateLimit";

// Helper to get audio duration using ffprobe
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        console.warn("⚠️ ffprobe failed, using default 120s duration", err);
        return resolve(120);
      }
      const duration = data?.format?.duration || 0;
      resolve(duration > 1 ? duration : 120);
    });
  });
}

// 🔒 Security limits for YouTube imports
const MAX_FILE_SIZE_MB = 50; // 50MB max

// Helper to download YouTube audio using yt-dlp (SECURE - prevents command injection)
async function downloadYouTubeAudio(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 🔐 Validate URL format (defense in depth)
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(url)) {
      return reject(new Error('Invalid YouTube URL'));
    }

    // 🔐 Use spawn with args array instead of shell command (prevents command injection)
    // Add max-filesize to prevent downloading huge files
    const maxFilesizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    const args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--max-filesize', maxFilesizeBytes.toString(), // Limit file size
      '-o', outputPath,
      url
    ];

    console.log("📥 Downloading from YouTube:", url);
    const process = spawn('yt-dlp', args);

    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log("✅ YouTube download completed");
        resolve();
      } else {
        // Try youtube-dl as fallback
        console.log("⚠️ yt-dlp failed, trying youtube-dl...");
        const fallbackProcess = spawn('youtube-dl', args);

        fallbackProcess.on('close', (fallbackCode) => {
          if (fallbackCode === 0) {
            console.log("✅ YouTube download completed with youtube-dl");
            resolve();
          } else {
            reject(new Error("Unable to import from YouTube. Please check the URL and try again."));
          }
        });

        fallbackProcess.on('error', () => {
          reject(new Error("Unable to import from YouTube. Please check the URL and try again."));
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

  // ⏱️ Rate limiting - prevent import abuse
  const rateLimit = checkRateLimit(user.id, RateLimits.MUSIC_IMPORT);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
    return res.status(429).json({
      error: "Too many import requests. Please wait before trying again.",
      retry_after: retryAfter
    });
  }

  let tempFilePath: string | null = null;

  try {
    const { url, name, description, category, notes, uploaded_by } = req.body;

    if (!url) {
      return res.status(400).json({ error: "YouTube URL is required" });
    }

    if (!name) {
      return res.status(400).json({ error: "Music name is required" });
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // Create temp file path (without extension, yt-dlp will add .mp3)
    const tempFileBase = path.join(tmpdir(), `youtube-${Date.now()}`);
    tempFilePath = `${tempFileBase}.mp3`;

    // Download audio from YouTube
    await downloadYouTubeAudio(url, tempFileBase);

    // Check if file exists (yt-dlp adds extension automatically)
    if (!fs.existsSync(tempFilePath)) {
      throw new Error("Downloaded file not found");
    }

    // 🔒 Validate file size (security check)
    const fileStats = fs.statSync(tempFilePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(400).json({
        error: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB (${fileSizeMB.toFixed(1)}MB detected).`
      });
    }

    // Get audio duration
    const duration = await getAudioDuration(tempFilePath);

    // Read the file
    const fileBuffer = fs.readFileSync(tempFilePath);
    const fileName = `${Date.now()}-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.mp3`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("background_music")
      .upload(fileName, fileBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(500).json({ error: uploadError.message });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("background_music")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Insert into background_music_library table
    const { data: musicData, error: dbError } = await supabaseAdmin
      .from("background_music_library")
      .insert({
        name,
        description: description || "",
        file_url: publicUrl,
        duration,
        category: category || "other",
        notes: notes || "",
        is_preset: false,
        uploaded_by: uploaded_by || "anonymous",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(500).json({ error: dbError.message });
    }

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return res.status(201).json({
      success: true,
      music: musicData,
      message: "Music imported from YouTube successfully",
    });
  } catch (err: any) {
    console.error("Error importing music from YouTube:", err);

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return res.status(500).json({ error: err.message });
  }
}
