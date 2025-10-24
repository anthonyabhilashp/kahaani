import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

export const config = {
  api: {
    bodyParser: false, // Disable body parser for file upload
  },
};

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse the multipart form data
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB max file size
    });

    const [fields, files] = await form.parse(req);

    const name = fields.name?.[0];
    const description = fields.description?.[0] || "";
    const category = fields.category?.[0] || "other";
    const uploaded_by = fields.uploaded_by?.[0] || "anonymous";
    const uploadedFile = files.file?.[0];

    if (!name) {
      return res.status(400).json({ error: "Music name is required" });
    }

    if (!uploadedFile) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate file type (audio only)
    const allowedTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/aac", "audio/ogg"];
    if (!allowedTypes.includes(uploadedFile.mimetype || "")) {
      return res.status(400).json({ error: "Invalid file type. Only audio files are allowed." });
    }

    // Get audio duration
    const duration = await getAudioDuration(uploadedFile.filepath);

    // Read the file
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const fileExtension = path.extname(uploadedFile.originalFilename || "music.mp3");
    const fileName = `${Date.now()}-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}${fileExtension}`;
    const filePath = `background_music/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("background_music")
      .upload(filePath, fileBuffer, {
        contentType: uploadedFile.mimetype || "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("background_music")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Insert into background_music_library table
    const { data: musicData, error: dbError } = await supabaseAdmin
      .from("background_music_library")
      .insert({
        name,
        description,
        file_url: publicUrl,
        duration,
        category,
        is_preset: false,
        uploaded_by,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({ error: dbError.message });
    }

    // Clean up temp file
    fs.unlinkSync(uploadedFile.filepath);

    return res.status(200).json({
      success: true,
      music: musicData,
      message: "Music uploaded to library successfully",
    });
  } catch (err: any) {
    console.error("Error in upload_music_to_library:", err);
    return res.status(500).json({ error: err.message });
  }
}
