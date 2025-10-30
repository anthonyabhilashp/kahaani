import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";

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

// Helper to download file from URL
async function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    const file = fs.createWriteStream(outputPath);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    protocol.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        if (response.headers.location) {
          file.close();
          fs.unlinkSync(outputPath);
          return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`Unable to download file. Please check the URL and try again.`));
        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url, name, description, category, notes, uploaded_by } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!name) {
      return res.status(400).json({ error: "Music name is required" });
    }

    // Create temp file path
    const tempFilePath = path.join(tmpdir(), `import-${Date.now()}.mp3`);

    // Download file from URL
    console.log("📥 Downloading from URL:", url);
    await downloadFile(url, tempFilePath);

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
      fs.unlinkSync(tempFilePath);
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
      fs.unlinkSync(tempFilePath);
      return res.status(500).json({ error: dbError.message });
    }

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    return res.status(201).json({
      success: true,
      music: musicData,
      message: "Music imported from URL successfully",
    });
  } catch (err: any) {
    console.error("Error importing music from URL:", err);
    return res.status(500).json({ error: err.message });
  }
}
