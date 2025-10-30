import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, scene_text, position } = req.body;

  if (!story_id || !scene_text || position === undefined) {
    return res.status(400).json({ error: "story_id, scene_text, and position are required" });
  }

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "add_scene");
    logger.log(`➕ Adding scene at position ${position} for story: ${story_id}`);

    // 1️⃣ Get all existing scenes for this story
    const { data: existingScenes, error: fetchError } = await supabaseAdmin
      .from("scenes")
      .select("id, order")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch existing scenes: ${fetchError.message}`);
    }

    logger.log(`📚 Found ${existingScenes?.length || 0} existing scenes`);

    // 2️⃣ Update order of existing scenes that come after the insertion position
    // Strategy: Use negative temporary values to avoid unique constraint violations
    // If position = 0, shift all scenes down
    // If position = 1, keep scene 0 at 0, shift scenes 1+ to 2+
    // If position = n, keep scenes 0 to n-1, shift scenes n+ to n+1+
    if (existingScenes && existingScenes.length > 0) {
      const scenesToUpdate = existingScenes.filter(scene => scene.order >= position);

      if (scenesToUpdate.length > 0) {
        logger.log(`🔄 Updating order for ${scenesToUpdate.length} scenes (avoiding constraint violations)...`);

        // Step 1: Move scenes to negative temporary positions (to avoid unique constraint violations)
        for (let i = 0; i < scenesToUpdate.length; i++) {
          const scene = scenesToUpdate[i];
          const tempOrder = -(i + 1); // Use negative numbers as temporary positions

          const { error: tempUpdateError } = await supabaseAdmin
            .from("scenes")
            .update({ order: tempOrder })
            .eq("id", scene.id);

          if (tempUpdateError) {
            throw new Error(`Failed to move scene to temp position: ${tempUpdateError.message}`);
          }
        }

        logger.log(`📦 Moved ${scenesToUpdate.length} scenes to temporary positions`);

        // Step 2: Move scenes to final positions (original order + 1)
        for (const scene of scenesToUpdate) {
          const finalOrder = scene.order + 1;

          const { error: finalUpdateError } = await supabaseAdmin
            .from("scenes")
            .update({ order: finalOrder })
            .eq("id", scene.id);

          if (finalUpdateError) {
            throw new Error(`Failed to update scene to final order: ${finalUpdateError.message}`);
          }
        }

        logger.log(`✅ Updated order for ${scenesToUpdate.length} scenes to final positions`);
      }
    }

    // 3️⃣ Insert the new scene at the specified position
    const { data: newScene, error: insertError } = await supabaseAdmin
      .from("scenes")
      .insert({
        story_id,
        text: scene_text,
        order: position
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert new scene: ${insertError.message}`);
    }

    logger.log(`✅ New scene added at position ${position} with id: ${newScene.id}`);

    // 4️⃣ Get all scenes after update to return
    const { data: updatedScenes, error: fetchUpdatedError } = await supabaseAdmin
      .from("scenes")
      .select("*")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (fetchUpdatedError) {
      logger.log(`⚠️ Warning: Could not fetch updated scenes: ${fetchUpdatedError.message}`);
    }

    // Update story metadata (completion status - new scene won't have audio/images)
    logger.log(`📊 Updating story metadata...`);
    await updateStoryMetadata(story_id);
    logger.log(`✅ Story metadata updated`);

    res.status(200).json({
      success: true,
      message: "Scene added successfully",
      new_scene: newScene,
      updated_scenes: updatedScenes
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Add scene error:", error);

    if (logger) {
      logger.log(`❌ Scene addition failed: ${errorMessage}`);
    }

    res.status(500).json({
      error: errorMessage
    });
  }
}
