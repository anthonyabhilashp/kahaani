import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, caption_settings } = req.body;

  if (!story_id) {
    return res.status(400).json({ error: "story_id is required" });
  }

  if (!caption_settings) {
    return res.status(400).json({ error: "caption_settings is required" });
  }

  try {
    // Validate caption_settings structure
    const {
      enabled,
      fontFamily,
      fontSize,
      fontWeight,
      positionFromBottom,
      activeColor,
      inactiveColor,
      wordsPerBatch,
      textTransform,
    } = caption_settings;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Invalid caption_settings: enabled must be boolean" });
    }

    // Update the story with new caption settings
    const { data, error } = await supabaseAdmin
      .from("stories")
      .update({
        caption_settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", story_id)
      .select()
      .single();

    if (error) {
      console.error("Error saving caption settings:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      caption_settings: data.caption_settings
    });
  } catch (err: any) {
    console.error("Error in save_caption_settings:", err);
    return res.status(500).json({ error: err.message });
  }
}
