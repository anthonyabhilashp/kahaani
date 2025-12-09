import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: short_id } = req.query;

  if (!short_id || typeof short_id !== "string") {
    return res.status(400).json({ error: "Invalid short ID" });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Unauthorized - Please log in" });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized - Invalid session" });
  }

  switch (req.method) {
    case "GET":
      return handleGet(short_id, user.id, res);
    case "PUT":
      return handlePut(short_id, user.id, req, res);
    case "DELETE":
      return handleDelete(short_id, user.id, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

// GET /api/shorts/[id]/music - Get music settings
async function handleGet(short_id: string, user_id: string, res: NextApiResponse) {
  try {
    const { data, error } = await supabaseAdmin
      .from("shorts")
      .select("music_settings")
      .eq("id", short_id)
      .eq("user_id", user_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Short not found" });
      }
      throw error;
    }

    const musicSettings = data.music_settings as { enabled?: boolean; music_id?: string; volume?: number } | null;

    // If music_id exists, fetch the music details
    let music = null;
    if (musicSettings?.music_id) {
      const { data: musicData } = await supabaseAdmin
        .from("background_music_library")
        .select("*")
        .eq("id", musicSettings.music_id)
        .single();

      music = musicData;
    }

    return res.status(200).json({
      enabled: musicSettings?.enabled || false,
      music_id: musicSettings?.music_id || null,
      volume: musicSettings?.volume ?? 30,
      music: music
    });
  } catch (err: any) {
    console.error("Error getting music settings:", err);
    return res.status(500).json({ error: err.message });
  }
}

// PUT /api/shorts/[id]/music - Update music settings
async function handlePut(short_id: string, user_id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const { enabled, music_id, volume } = req.body;

    // Validate inputs
    if (enabled !== undefined && typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Invalid: enabled must be boolean" });
    }

    if (volume !== undefined && (typeof volume !== "number" || volume < 0 || volume > 100)) {
      return res.status(400).json({ error: "Invalid: volume must be 0-100" });
    }

    // Get current settings
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from("shorts")
      .select("music_settings")
      .eq("id", short_id)
      .eq("user_id", user_id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Short not found" });
      }
      throw fetchError;
    }

    // Merge with existing settings
    const currentSettings = (currentData.music_settings as any) || {};
    const newSettings = {
      enabled: enabled !== undefined ? enabled : (currentSettings.enabled || false),
      music_id: music_id !== undefined ? music_id : (currentSettings.music_id || null),
      volume: volume !== undefined ? volume : (currentSettings.volume ?? 30),
    };

    // Update
    const { data, error } = await supabaseAdmin
      .from("shorts")
      .update({
        music_settings: newSettings,
        updated_at: new Date().toISOString()
      })
      .eq("id", short_id)
      .eq("user_id", user_id)
      .select("music_settings")
      .single();

    if (error) {
      throw error;
    }

    // Fetch music details if music_id exists
    let music = null;
    if (newSettings.music_id) {
      const { data: musicData } = await supabaseAdmin
        .from("background_music_library")
        .select("*")
        .eq("id", newSettings.music_id)
        .single();

      music = musicData;
    }

    return res.status(200).json({
      success: true,
      enabled: newSettings.enabled,
      music_id: newSettings.music_id,
      volume: newSettings.volume,
      music: music
    });
  } catch (err: any) {
    console.error("Error updating music settings:", err);
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /api/shorts/[id]/music - Remove music settings
async function handleDelete(short_id: string, user_id: string, res: NextApiResponse) {
  try {
    const { error } = await supabaseAdmin
      .from("shorts")
      .update({
        music_settings: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", short_id)
      .eq("user_id", user_id);

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Short not found" });
      }
      throw error;
    }

    return res.status(200).json({ success: true, message: "Music settings removed" });
  } catch (err: any) {
    console.error("Error removing music settings:", err);
    return res.status(500).json({ error: err.message });
  }
}
