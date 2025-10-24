import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { category, is_preset, uploaded_by } = req.query;

    let query = supabaseAdmin
      .from("background_music_library")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }

    if (is_preset !== undefined) {
      query = query.eq("is_preset", is_preset === "true");
    }

    if (uploaded_by) {
      query = query.eq("uploaded_by", uploaded_by);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching music library:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      music_library: data || [],
    });
  } catch (err: any) {
    console.error("Error in get_music_library:", err);
    return res.status(500).json({ error: err.message });
  }
}
