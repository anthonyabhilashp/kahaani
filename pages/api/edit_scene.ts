import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, scene_id, scene_order, text } = req.body;
  
  if (!story_id || (!scene_id && scene_order === undefined) || !text) {
    return res.status(400).json({ error: "story_id, scene identifier, and text are required" });
  }

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "edit_scene");
    logger.log(`📝 Editing scene for story: ${story_id}`);

    // Update the scene in the database
    // Note: The database trigger will automatically invalidate the video
    let updateResult;
    if (scene_id) {
      // Update by scene_id if available
      updateResult = await supabaseAdmin
        .from("scenes")
        .update({ text })
        .eq("id", scene_id)
        .eq("story_id", story_id);
    } else {
      // Update by order if scene_id not available
      updateResult = await supabaseAdmin
        .from("scenes")
        .update({ text })
        .eq("story_id", story_id)
        .eq("order", scene_order);
    }

    if (updateResult.error) {
      throw new Error(`Failed to update scene: ${updateResult.error.message}`);
    }

    logger.log("✅ Scene updated successfully");

    res.status(200).json({ 
      success: true, 
      message: "Scene updated successfully" 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Edit scene error:", error);
    
    if (logger) {
      logger.log(`❌ Scene edit failed: ${errorMessage}`);
    }

    res.status(500).json({ 
      error: errorMessage 
    });
  }
}