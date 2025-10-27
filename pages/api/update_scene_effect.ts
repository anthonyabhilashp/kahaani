import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { scene_id, effect_id } = req.body;

  if (!scene_id || !effect_id) {
    return res.status(400).json({ error: "scene_id and effect_id are required" });
  }

  try {
    // Update the scene's effects
    const { error } = await supabaseAdmin
      .from("scenes")
      .update({
        effects: { motion: effect_id },
      })
      .eq("id", scene_id);

    if (error) throw error;

    res.status(200).json({ success: true, scene_id, effect_id });
  } catch (err: any) {
    console.error("Error updating scene effect:", err);
    res.status(500).json({ error: err.message || "Failed to update effect" });
  }
}
