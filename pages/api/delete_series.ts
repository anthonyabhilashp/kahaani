import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { series_id } = req.body;

  if (!series_id) {
    return res.status(400).json({ error: "series_id is required" });
  }

  try {
    // 1️⃣ Check if series exists and has no stories
    const { data: seriesData, error: seriesError } = await supabaseAdmin
      .from("series")
      .select("id, title, story_count")
      .eq("id", series_id)
      .single();

    if (seriesError || !seriesData) {
      return res.status(404).json({ error: "Series not found" });
    }

    // 2️⃣ Verify series has no stories
    if (seriesData.story_count > 0) {
      return res.status(400).json({
        error: "Cannot delete series with existing stories. Please remove all stories from the series first."
      });
    }

    // 3️⃣ Double-check by counting actual stories (safety check)
    const { count, error: countError } = await supabaseAdmin
      .from("stories")
      .select("*", { count: "exact", head: true })
      .eq("series_id", series_id);

    if (countError) {
      throw new Error(`Failed to count stories: ${countError.message}`);
    }

    if (count && count > 0) {
      return res.status(400).json({
        error: `Cannot delete series. Found ${count} story(ies) still associated with it.`
      });
    }

    // 4️⃣ Delete the series
    const { error: deleteError } = await supabaseAdmin
      .from("series")
      .delete()
      .eq("id", series_id);

    if (deleteError) {
      throw new Error(`Failed to delete series: ${deleteError.message}`);
    }

    console.log(`✅ Series deleted successfully: ${seriesData.title} (${series_id})`);

    res.status(200).json({
      success: true,
      message: "Series deleted successfully"
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${series_id}] Delete series error:`, error);

    res.status(500).json({
      error: errorMessage
    });
  }
}
