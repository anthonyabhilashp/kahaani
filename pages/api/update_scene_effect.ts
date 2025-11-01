import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { scene_id, effect_id, overlay_id, overlay_url } = req.body;

  if (!scene_id) {
    return res.status(400).json({ error: "scene_id is required" });
  }

  try {
    // First, get the current effects to merge with new values
    const { data: currentScene } = await supabaseAdmin
      .from("scenes")
      .select("effects")
      .eq("id", scene_id)
      .single();

    // Build updated effects object
    const currentEffects = (currentScene?.effects || {}) as any;
    const updatedEffects = { ...currentEffects };

    // Update motion effect if provided
    if (effect_id !== undefined) {
      updatedEffects.motion = effect_id;
    }

    // Update overlay if provided
    if (overlay_id !== undefined) {
      if (overlay_id === null) {
        delete updatedEffects.overlay_id;
        delete updatedEffects.overlay_url;
      } else {
        updatedEffects.overlay_id = overlay_id;
        if (overlay_url) {
          updatedEffects.overlay_url = overlay_url;
        }
      }
    }

    // Update the scene's effects
    const { error } = await supabaseAdmin
      .from("scenes")
      .update({ effects: updatedEffects })
      .eq("id", scene_id);

    if (error) throw error;

    res.status(200).json({ success: true, scene_id, effects: updatedEffects });
  } catch (err: any) {
    console.error("Error updating scene effect:", err);
    res.status(500).json({ error: err.message || "Failed to update effect" });
  }
}
