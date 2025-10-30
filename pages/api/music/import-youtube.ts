import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

// Helper to download YouTube audio using yt-dlp
async function downloadYouTubeAudio(url: string, outputPath: string): Promise<void> {
  try {
    // Use yt-dlp (or youtube-dl fallback) to download audio only
    // yt-dlp is more maintained and works better with recent YouTube changes
    const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputPath}" "${url}"`;

    console.log("📥 Downloading from YouTube:", url);
    await execAsync(command);

    console.log("✅ YouTube download completed");
  } catch (error: any) {
    // Try youtube-dl as fallback
    try {
      console.log("⚠️ yt-dlp failed, trying youtube-dl...");
      const fallbackCommand = `youtube-dl -x --audio-format mp3 --audio-quality 0 -o "${outputPath}" "${url}"`;
      await execAsync(fallbackCommand);
      console.log("✅ YouTube download completed with youtube-dl");
    } catch (fallbackError) {
      throw new Error("Unable to import from YouTube. Please check the URL and try again.");
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let tempFilePath: string | null = null;

  try {
    const { url, name, description, category, uploaded_by } = req.body;

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
