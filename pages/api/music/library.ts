import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

export const config = {
  api: {
    bodyParser: false, // Disable for file uploads
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
  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "POST":
      return handlePost(req, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

// GET /api/music/library - Get music library
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { category, user_id, search, preset_only } = req.query;

    let query = supabaseAdmin
      .from("background_music_library")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (category && typeof category === "string") {
      query = query.eq("category", category);
    }

    if (preset_only === "true") {
      query = query.eq("is_preset", true);
    } else if (user_id && typeof user_id === "string") {
      // Show user's music + presets
      query = query.or(`uploaded_by.eq.${user_id},is_preset.eq.true`);
    }

    if (search && typeof search === "string") {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return res.status(200).json({
      music: data || [],
      count: data?.length || 0
    });
  } catch (err: any) {
    console.error("Error fetching music library:", err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/music/library - Upload music to library
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
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

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("background_music")
      .upload(fileName, fileBuffer, {
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
      .getPublicUrl(fileName);

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

    return res.status(201).json({
      success: true,
      music: musicData,
      message: "Music uploaded to library successfully",
    });
  } catch (err: any) {
    console.error("Error in upload music to library:", err);
    return res.status(500).json({ error: err.message });
  }
}