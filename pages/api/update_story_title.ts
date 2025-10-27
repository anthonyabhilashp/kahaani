import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, title } = req.body;

  if (!story_id || !title) {
    return res.status(400).json({ error: "story_id and title are required" });
  }

  try {
    // Update story title
    const { error: updateError } = await supabaseAdmin
      .from("stories")
      .update({
        title: title.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", story_id);

    if (updateError) {
      throw new Error(`Failed to update story title: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      message: "Story title updated successfully",
      title: title.trim()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Update story title error:", error);

    res.status(500).json({
      error: errorMessage
    });
  }
}
