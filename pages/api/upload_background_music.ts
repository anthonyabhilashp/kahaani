import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false, // Disable body parser for file upload
  },
};

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

    const story_id = fields.story_id?.[0];
    const uploadedFile = files.file?.[0];

    if (!story_id) {
      return res.status(400).json({ error: "story_id is required" });
    }

    if (!uploadedFile) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate file type (audio only)
    const allowedTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/aac"];
    if (!allowedTypes.includes(uploadedFile.mimetype || "")) {
      return res.status(400).json({ error: "Invalid file type. Only audio files are allowed." });
    }

    // Read the file
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const fileExtension = path.extname(uploadedFile.originalFilename || "music.mp3");
    const fileName = `${story_id}-background${fileExtension}`;
    const filePath = `background_music/${fileName}`;

    // Delete old background music for this story if it exists
    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("background_music_settings")
      .eq("id", story_id)
      .single();

    if (story?.background_music_settings?.music_url) {
      const oldFilePath = story.background_music_settings.music_url.split("/background_music/")[1];
      if (oldFilePath) {
        await supabaseAdmin.storage.from("background_music").remove([oldFilePath]);
      }
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("background_music")
      .upload(filePath, fileBuffer, {
        contentType: uploadedFile.mimetype || "audio/mpeg",
        upsert: true, // Overwrite if exists
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

    // Update story with new background music settings
    const { error: updateError } = await supabaseAdmin
      .from("stories")
      .update({
        background_music_settings: {
          enabled: true,
          music_url: publicUrl,
          volume: 30, // Default 30% volume
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", story_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    // Clean up temp file
    fs.unlinkSync(uploadedFile.filepath);

    return res.status(200).json({
      success: true,
      music_url: publicUrl,
      message: "Background music uploaded successfully",
    });
  } catch (err: any) {
    console.error("Error in upload_background_music:", err);
    return res.status(500).json({ error: err.message });
  }
}
