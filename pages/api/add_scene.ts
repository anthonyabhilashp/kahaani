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
    // If position = 0, shift all scenes down
    // If position = 1, keep scene 0 at 0, shift scenes 1+ to 2+
    // If position = n, keep scenes 0 to n-1, shift scenes n+ to n+1+
    if (existingScenes && existingScenes.length > 0) {
      const scenesToUpdate = existingScenes.filter(scene => scene.order >= position);

      if (scenesToUpdate.length > 0) {
        logger.log(`🔄 Updating order for ${scenesToUpdate.length} scenes...`);

        // Update each scene's order (increment by 1)
        for (const scene of scenesToUpdate) {
          const { error: updateError } = await supabaseAdmin
            .from("scenes")
            .update({ order: scene.order + 1 })
            .eq("id", scene.id);

          if (updateError) {
            throw new Error(`Failed to update scene order: ${updateError.message}`);
          }
        }

        logger.log(`✅ Updated order for ${scenesToUpdate.length} scenes`);
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
