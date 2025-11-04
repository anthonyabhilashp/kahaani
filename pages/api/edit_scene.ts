import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getUserLogger } from "../../lib/userLogger";
import { calculateSceneDuration } from "../../lib/utils";

// Generate synthetic word timestamps for text-based scenes (no audio)
function generateWordTimestamps(text: string): Array<{ word: string; start: number; end: number }> {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordsPerSecond = 2; // Reading speed (same as duration calculation)
  const wordDuration = 1 / wordsPerSecond;

  return words.map((word, i) => ({
    word: word,
    start: i * wordDuration,
    end: (i + 1) * wordDuration
  }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, scene_id, scene_order, text } = req.body;

  if (!story_id || (!scene_id && scene_order === undefined)) {
    return res.status(400).json({ error: "story_id and scene identifier are required" });
  }

  try {
    // Get user_id from story for logging
    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("user_id")
      .eq("id", story_id)
      .single();

    const logger = story?.user_id ? getUserLogger(story.user_id) : null;
    logger?.info(`[${story_id}] 📝 Editing scene for story`);

    // Update the scene in the database
    // Note: The database trigger will automatically invalidate the video
    const updateData: any = {
      last_modified_at: new Date().toISOString()
    };

    // Update text if provided
    if (text !== undefined) {
      updateData.text = text;
      updateData.scene_text_modified_at = new Date().toISOString();
      // Recalculate duration based on new text
      updateData.duration = calculateSceneDuration(text);
      // Regenerate word timestamps based on new text
      updateData.word_timestamps = text.trim().length > 0 ? generateWordTimestamps(text) : [];
      logger?.info(`[${story_id}] 📝 Regenerated word timestamps for updated text`);
    }

    let updateResult;
    if (scene_id) {
      // Update by scene_id if available
      updateResult = await supabaseAdmin
        .from("scenes")
        .update(updateData)
        .eq("id", scene_id)
        .eq("story_id", story_id);
    } else {
      // Update by order if scene_id not available
      updateResult = await supabaseAdmin
        .from("scenes")
        .update(updateData)
        .eq("story_id", story_id)
        .eq("order", scene_order);
    }

    if (updateResult.error) {
      throw new Error(`Failed to update scene: ${updateResult.error.message}`);
    }

    logger?.info(`[${story_id}] ✅ Scene updated successfully`);

    res.status(200).json({ 
      success: true, 
      message: "Scene updated successfully" 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${story_id}] Edit scene error:`, error);

    res.status(500).json({ 
      error: errorMessage 
    });
  }
}