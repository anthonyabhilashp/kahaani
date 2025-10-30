import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, ...updateFields } = req.body;

  if (!story_id) {
    return res.status(400).json({ error: "story_id is required" });
  }

  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: "At least one field to update is required" });
  }

  try {
    // Update story with provided fields and set updated_at timestamp
    const { error: updateErr } = await supabaseAdmin
      .from("stories")
      .update({
        ...updateFields,
        updated_at: new Date().toISOString()
      })
      .eq("id", story_id);

    if (updateErr) throw updateErr;

    console.log(`✅ Updated story ${story_id} with fields:`, updateFields);
    res.status(200).json({ success: true, story_id, updated_fields: updateFields });
  } catch (err: any) {
    console.error("❌ Error updating story:", err);
    res.status(500).json({ error: err.message });
  }
}
