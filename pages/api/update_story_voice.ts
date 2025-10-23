import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, voice_id } = req.body;

  if (!story_id || !voice_id) {
    return res.status(400).json({ error: "story_id and voice_id are required" });
  }

  try {
    // Update story's default voice_id
    const { error: updateErr } = await supabaseAdmin
      .from("stories")
      .update({ voice_id })
      .eq("id", story_id);

    if (updateErr) throw updateErr;

    console.log(`✅ Updated story ${story_id} default voice to: ${voice_id}`);
    res.status(200).json({ success: true, story_id, voice_id });
  } catch (err: any) {
    console.error("❌ Error updating story voice:", err);
    res.status(500).json({ error: err.message });
  }
}
