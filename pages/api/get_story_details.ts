import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing story id" });

  try {
    // 🚀 Simplified: Only fetch story, scenes (with image_url, audio_url, voice_id), and videos
    const [{ data: story }, { data: scenes }, { data: videoRows, error: videoErr }] =
      await Promise.all([
        supabaseAdmin.from("stories").select("*").eq("id", id).single(),
        supabaseAdmin.from("scenes").select("id, story_id, text, order, image_url, audio_url, voice_id, duration, word_timestamps").eq("story_id", id).order("order"),
        supabaseAdmin
          .from("videos")
          .select("*")
          .eq("story_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    // ✅ normalize video (ensure object or null)
    const video = videoRows?.[0] || null;

    if (videoErr) console.warn("⚠️ videoErr:", videoErr);

    // 🎯 Return simplified structure - scenes contain all their media info
    res.status(200).json({ 
      story, 
      scenes: scenes || [],
      video 
    });
  } catch (err: any) {
    console.error("❌ Error in get_story_details:", err);
    res.status(500).json({ error: err.message });
  }
}
