import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing story id" });

  try {
    const [{ data: story }, { data: scenes }, { data: images }, { data: audio }, { data: videoRows, error: videoErr }] =
      await Promise.all([
        supabaseAdmin.from("stories").select("*").eq("id", id).single(),
        supabaseAdmin.from("scenes").select("*").eq("story_id", id).order("order"),
        supabaseAdmin.from("images").select("*").eq("story_id", id).order("scene_order"),
        supabaseAdmin
          .from("audio")
          .select("*")
          .eq("story_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
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

    res.status(200).json({ story, scenes, images, audio, video });
  } catch (err: any) {
    console.error("❌ Error in get_story_details:", err);
    res.status(500).json({ error: err.message });
  }
}
