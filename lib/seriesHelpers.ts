import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Recalculate and persist the story_count for a series.
 * Called whenever we add/remove stories from a series so the dashboard stays in sync.
 */
export async function updateSeriesStoryCount(seriesId: string): Promise<void> {
  if (!seriesId) return;

  const { count, error: countError } = await supabaseAdmin
    .from("stories")
    .select("*", { count: "exact", head: true })
    .eq("series_id", seriesId);

  if (countError) {
    console.error(`Failed to count stories for series ${seriesId}:`, countError);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("series")
    .update({
      story_count: count || 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId);

  if (updateError) {
    console.error(`Failed to update series ${seriesId} count:`, updateError);
  }
}
