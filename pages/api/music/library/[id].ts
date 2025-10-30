import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Invalid music ID" });
  }

  switch (req.method) {
    case "GET":
      return handleGet(id, res);
    case "DELETE":
      return handleDelete(id, req, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

// GET /api/music/library/[id] - Get specific music track
async function handleGet(id: string, res: NextApiResponse) {
  try {
    const { data, error } = await supabaseAdmin
      .from("background_music_library")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Music not found" });
      }
      throw error;
    }

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("Error fetching music:", err);
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /api/music/library/[id] - Delete music track (only if uploaded by user)
async function handleDelete(id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const { user_id } = req.query;

    if (!user_id || typeof user_id !== "string") {
      return res.status(400).json({ error: "User ID is required for deletion" });
    }

    // First check if the music exists and belongs to the user
    const { data: music, error: fetchError } = await supabaseAdmin
      .from("background_music_library")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Music not found" });
      }
      throw fetchError;
    }

    // Check ownership
    if (music.uploaded_by !== user_id) {
      return res.status(403).json({ error: "You can only delete your own music" });
    }

    // Don't allow deleting presets
    if (music.is_preset) {
      return res.status(403).json({ error: "Cannot delete preset music" });
    }

    // Delete from storage if it exists
    if (music.file_url) {
      const fileName = music.file_url.split('/').pop();
      if (fileName) {
        await supabaseAdmin.storage
          .from("background_music")
          .remove([fileName]);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from("background_music_library")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    // Also remove this music from any stories using it
    await supabaseAdmin
      .from("stories")
      .update({
        background_music_id: null,
        background_music_enabled: false
      })
      .eq("background_music_id", id);

    return res.status(200).json({
      success: true,
      message: "Music deleted successfully"
    });
  } catch (err: any) {
    console.error("Error deleting music:", err);
    return res.status(500).json({ error: err.message });
  }
}