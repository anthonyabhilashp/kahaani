import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Helper function to recalculate and update series story count
async function updateSeriesStoryCount(seriesId: string): Promise<void> {
  // Count actual stories in this series
  const { count, error: countError } = await supabaseAdmin
    .from("stories")
    .select("*", { count: "exact", head: true })
    .eq("series_id", seriesId);

  if (countError) {
    console.error(`Failed to count stories for series ${seriesId}:`, countError);
    return;
  }

  // Update the series with the actual count
  const { error: updateError } = await supabaseAdmin
    .from("series")
    .update({
      story_count: count || 0,
      updated_at: new Date().toISOString()
    })
    .eq("id", seriesId);

  if (updateError) {
    console.error(`Failed to update series ${seriesId} count:`, updateError);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const { story_id, series_id } = req.body;

    if (!story_id) {
      return res.status(400).json({ error: "story_id is required" });
    }

    // Get the story's current series_id to handle count updates
    const { data: currentStory, error: currentStoryError } = await supabaseAdmin
      .from("stories")
      .select("series_id")
      .eq("id", story_id)
      .eq("user_id", user.id)
      .single();

    if (currentStoryError || !currentStory) {
      return res.status(404).json({ error: "Story not found" });
    }

    const oldSeriesId = currentStory.series_id;

    // If series_id is null, remove from series
    if (series_id === null) {
      const { data, error } = await supabaseAdmin
        .from("stories")
        .update({
          series_id: null,
        })
        .eq("id", story_id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;

      // Recalculate story_count on old series (async, non-blocking)
      if (oldSeriesId) {
        updateSeriesStoryCount(oldSeriesId).catch(err =>
          console.error(`Failed to update series ${oldSeriesId} count:`, err)
        );
      }

      return res.status(200).json(data);
    }

    // Verify series belongs to user
    const { data: series, error: seriesError } = await supabaseAdmin
      .from("series")
      .select("id")
      .eq("id", series_id)
      .eq("user_id", user.id)
      .single();

    if (seriesError || !series) {
      return res.status(404).json({ error: "Series not found" });
    }

    // Add story to series
    const { data: story, error } = await supabaseAdmin
      .from("stories")
      .update({
        series_id,
      })
      .eq("id", story_id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;

    // Recalculate story counts on both old and new series (async, non-blocking)
    if (oldSeriesId && oldSeriesId !== series_id) {
      updateSeriesStoryCount(oldSeriesId).catch(err =>
        console.error(`Failed to update old series ${oldSeriesId} count:`, err)
      );
    }

    if (series_id) {
      updateSeriesStoryCount(series_id).catch(err =>
        console.error(`Failed to update new series ${series_id} count:`, err)
      );
    }

    return res.status(200).json(story);
  } catch (err: any) {
    console.error("Add to series error:", err);
    res.status(500).json({ error: err.message });
  }
}
