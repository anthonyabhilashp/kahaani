import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing scene id" });

  try {
    const { data: scene, error } = await supabaseAdmin
      .from("scenes")
      .select("id, story_id, text, order, image_url, video_url, audio_url, voice_id, duration, word_timestamps, last_modified_at, created_at, image_generated_at, audio_generated_at, scene_text_modified_at, effects")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!scene) return res.status(404).json({ error: "Scene not found" });

    res.status(200).json({ scene });
  } catch (err: any) {
    console.error("❌ Error in get_scene_details:", err);
    res.status(500).json({ error: err.message });
  }
}
