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

// Helper to generate thumbnail from video
async function generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['00:00:01'], // 1 second into video
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x180' // Thumbnail size
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "POST":
      return handlePost(req, res);
    case "DELETE":
      return handleDelete(req, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

// GET /api/overlays/library - Get overlay effects library
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { category, search, preset_only, aspect_ratio } = req.query;

    let query = supabaseAdmin
      .from("overlay_effects")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (category && typeof category === "string") {
      query = query.eq("category", category);
    }

    if (preset_only === "true") {
      query = query.eq("is_preset", true);
    }

    if (search && typeof search === "string") {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // If aspect_ratio is provided, modify file URLs to use aspect-ratio-specific folders
    let overlays = data || [];
    if (aspect_ratio && typeof aspect_ratio === "string") {
      // Map aspect ratio from "9:16" to folder name "9-16"
      const aspectFolder = aspect_ratio.replace(':', '-');

      overlays = overlays.map(overlay => {
        // Extract the filename from the full URL
        // Example: https://...supabase.co/storage/v1/object/public/overlay_effects/FileName.webm
        // We want to construct: https://...supabase.co/storage/v1/object/public/overlay_effects/9-16/FileName.webm

        const fileName = overlay.file_url.split('/').pop();
        const baseUrl = overlay.file_url.substring(0, overlay.file_url.lastIndexOf('/'));

        return {
          ...overlay,
          file_url: `${baseUrl}/${aspectFolder}/${fileName}`
        };
      });
    }

    return res.status(200).json({
      overlays: overlays,
      count: overlays?.length || 0
    });
  } catch (err: any) {
    console.error("Error fetching overlay library:", err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/overlays/library - Upload overlay to library
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  let tempFilePath: string | null = null;
  let tempThumbnailPath: string | null = null;

  try {
    // Parse the multipart form data
    const form = formidable({
      maxFileSize: 100 * 1024 * 1024, // 100MB max file size
    });

    const [fields, files] = await form.parse(req);

    const name = fields.name?.[0];
    const category = fields.category?.[0] || "other";
    const uploadedFile = files.file?.[0];

    if (!name) {
      return res.status(400).json({ error: "Overlay name is required" });
    }

    if (!uploadedFile) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate file type (video only)
    const allowedTypes = ["video/webm", "video/mp4", "video/quicktime"];
    if (!allowedTypes.includes(uploadedFile.mimetype || "")) {
      return res.status(400).json({ error: "Invalid file type. Only video files (WebM, MP4, MOV) are allowed." });
    }

    tempFilePath = uploadedFile.filepath;

    // Generate thumbnail
    const thumbnailFileName = `thumb-${Date.now()}.jpg`;
    tempThumbnailPath = path.join(path.dirname(tempFilePath), thumbnailFileName);

    try {
      await generateThumbnail(tempFilePath, tempThumbnailPath);
    } catch (thumbErr) {
      console.warn("⚠️ Thumbnail generation failed, continuing without thumbnail");
      tempThumbnailPath = null;
    }

    // Read the video file
    const fileBuffer = fs.readFileSync(tempFilePath);
    const fileExtension = path.extname(uploadedFile.originalFilename || "overlay.webm");
    const fileName = `${Date.now()}-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}${fileExtension}`;

    // Upload video to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("overlay_effects")
      .upload(fileName, fileBuffer, {
        contentType: uploadedFile.mimetype || "video/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    // Get public URL for video
    const { data: urlData } = supabaseAdmin.storage
      .from("overlay_effects")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Upload thumbnail if generated
    let thumbnailUrl = null;
    if (tempThumbnailPath && fs.existsSync(tempThumbnailPath)) {
      const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);
      const thumbnailName = `thumb-${fileName.replace(fileExtension, '.jpg')}`;

      const { error: thumbUploadError } = await supabaseAdmin.storage
        .from("overlay_effects")
        .upload(thumbnailName, thumbnailBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (!thumbUploadError) {
        const { data: thumbUrlData } = supabaseAdmin.storage
          .from("overlay_effects")
          .getPublicUrl(thumbnailName);
        thumbnailUrl = thumbUrlData.publicUrl;
      }
    }

    // Insert into overlay_effects table
    const { data: overlayData, error: dbError } = await supabaseAdmin
      .from("overlay_effects")
      .insert({
        name,
        category,
        file_url: publicUrl,
        thumbnail_url: thumbnailUrl,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({ error: dbError.message });
    }

    // Clean up temp files
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    if (tempThumbnailPath && fs.existsSync(tempThumbnailPath)) {
      fs.unlinkSync(tempThumbnailPath);
    }

    return res.status(201).json({
      success: true,
      overlay: overlayData,
      message: "Overlay uploaded successfully",
    });
  } catch (err: any) {
    console.error("Error uploading overlay:", err);

    // Clean up temp files on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    if (tempThumbnailPath && fs.existsSync(tempThumbnailPath)) {
      fs.unlinkSync(tempThumbnailPath);
    }

    return res.status(500).json({ error: err.message });
  }
}

// DELETE /api/overlays/library/:id - Delete overlay
async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Overlay ID required" });
    }

    // Get overlay details to delete files from storage
    const { data: overlay, error: fetchError } = await supabaseAdmin
      .from("overlay_effects")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !overlay) {
      return res.status(404).json({ error: "Overlay not found" });
    }

    // Delete files from storage
    if (overlay.file_url) {
      const fileName = overlay.file_url.split('/').pop();
      if (fileName) {
        await supabaseAdmin.storage.from("overlay_effects").remove([fileName]);
      }
    }

    if (overlay.thumbnail_url) {
      const thumbName = overlay.thumbnail_url.split('/').pop();
      if (thumbName) {
        await supabaseAdmin.storage.from("overlay_effects").remove([thumbName]);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from("overlay_effects")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return res.status(200).json({
      success: true,
      message: "Overlay deleted successfully"
    });
  } catch (err: any) {
    console.error("Error deleting overlay:", err);
    return res.status(500).json({ error: err.message });
  }
}
