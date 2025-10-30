import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: story_id } = req.query;

  if (!story_id || typeof story_id !== "string") {
    return res.status(400).json({ error: "Invalid story ID" });
  }

  switch (req.method) {
    case "GET":
      return handleGet(story_id, res);
    case "PUT":
      return handlePut(story_id, req, res);
    case "DELETE":
      return handleDelete(story_id, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

// GET /api/story/[id]/background_music - Get background music settings
async function handleGet(story_id: string, res: NextApiResponse) {
  try {
    const { data, error } = await supabaseAdmin
      .from("stories")
      .select("background_music_id, background_music_volume, background_music_enabled")
      .eq("id", story_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Story not found" });
      }
      throw error;
    }

    // If music_id exists, fetch the music details
    let music = null;
    if (data.background_music_id) {
      const { data: musicData } = await supabaseAdmin
        .from("background_music_library")
        .select("*")
        .eq("id", data.background_music_id)
        .single();

      music = musicData;
    }

    return res.status(200).json({
      music_id: data.background_music_id,
      volume: data.background_music_volume || 30,
      enabled: data.background_music_enabled || false,
      music: music
    });
  } catch (err: any) {
    console.error("Error getting background music settings:", err);
    return res.status(500).json({ error: err.message });
  }
}

// PUT /api/story/[id]/background_music - Update background music settings
async function handlePut(story_id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const { music_id, volume, enabled } = req.body;

    // Validate inputs
    if (enabled !== undefined && typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Invalid: enabled must be boolean" });
    }

    if (volume !== undefined && (typeof volume !== "number" || volume < 0 || volume > 100)) {
      return res.status(400).json({ error: "Invalid: volume must be 0-100" });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (music_id !== undefined) {
      updateData.background_music_id = music_id;
    }

    if (volume !== undefined) {
      updateData.background_music_volume = volume;
    }

    if (enabled !== undefined) {
      updateData.background_music_enabled = enabled;
    }

    const { data, error } = await supabaseAdmin
      .from("stories")
      .update(updateData)
      .eq("id", story_id)
      .select("background_music_id, background_music_volume, background_music_enabled")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Story not found" });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      music_id: data.background_music_id,
      volume: data.background_music_volume,
      enabled: data.background_music_enabled,
    });
  } catch (err: any) {
    console.error("Error updating background music settings:", err);
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /api/story/[id]/background_music - Remove background music
async function handleDelete(story_id: string, res: NextApiResponse) {
  try {
    const { error } = await supabaseAdmin
      .from("stories")
      .update({
        background_music_id: null,
        background_music_volume: 30,
        background_music_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", story_id);

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Story not found" });
      }
      throw error;
    }

    return res.status(200).json({ success: true, message: "Background music removed" });
  } catch (err: any) {
    console.error("Error removing background music:", err);
    return res.status(500).json({ error: err.message });
  }
}