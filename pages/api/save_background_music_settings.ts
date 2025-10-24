import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, music_id, volume, enabled } = req.body;

  if (!story_id) {
    return res.status(400).json({ error: "story_id is required" });
  }

  try {
    // Validate inputs
    if (enabled !== undefined && typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Invalid: enabled must be boolean" });
    }

    if (volume !== undefined && (typeof volume !== "number" || volume < 0 || volume > 100)) {
      return res.status(400).json({ error: "Invalid: volume must be 0-100" });
    }

    // Update the story with new background music settings
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
      .select()
      .single();

    if (error) {
      console.error("Error saving background music settings:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      background_music: {
        music_id: data.background_music_id,
        volume: data.background_music_volume,
        enabled: data.background_music_enabled,
      },
    });
  } catch (err: any) {
    console.error("Error in save_background_music_settings:", err);
    return res.status(500).json({ error: err.message });
  }
}
