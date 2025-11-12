import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { URL } from "url";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { checkRateLimit, RateLimits } from "@/lib/rateLimit";

// 🔒 Security limits for URL imports
const MAX_FILE_SIZE_MB = 50; // 50MB max

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

// Helper to download file from URL (SECURE - prevents SSRF attacks)
async function downloadFile(urlString: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 🔐 Parse and validate URL
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      return reject(new Error('Invalid URL'));
    }

    // 🔐 Only allow HTTP/HTTPS protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error('Only HTTP/HTTPS protocols are allowed'));
    }

    // 🔐 Block access to private/internal IP ranges and localhost
    const hostname = url.hostname.toLowerCase();
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254', // AWS metadata
      '::1', // IPv6 localhost
      'metadata.google.internal', // GCP metadata
    ];

    if (blockedHosts.includes(hostname)) {
      return reject(new Error('Access to internal resources is not allowed'));
    }

    // 🔐 Block private IP ranges (RFC 1918)
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname.startsWith('192.168.')
    ) {
      return reject(new Error('Access to private networks is not allowed'));
    }

    const protocol = url.protocol === 'https:' ? https : http;

    const file = fs.createWriteStream(outputPath);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    protocol.get(urlString, options, (response) => {
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
