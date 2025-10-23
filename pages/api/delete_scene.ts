import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id, scene_id, scene_order } = req.body;
  
  if (!story_id || (!scene_id && scene_order === undefined)) {
    return res.status(400).json({ error: "story_id and scene identifier are required" });
  }

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "delete_scene");
    logger.log(`🗑️ Deleting scene for story: ${story_id}`);

    // 1️⃣ Get scene data before deleting (for storage cleanup)
    const { data: sceneData, error: fetchSceneError } = await supabaseAdmin
      .from("scenes")
      .select("id, image_url, audio_url")
      .eq("id", scene_id)
      .single();

    if (fetchSceneError) {
      logger.log(`⚠️ Warning: Could not fetch scene data: ${fetchSceneError.message}`);
    } else {
      logger.log(`📦 Scene data: image=${!!sceneData?.image_url}, audio=${!!sceneData?.audio_url}`);
    }

    // Get image URLs before deleting from database (for storage cleanup)
    const { data: imagesToDelete, error: fetchImagesError } = await supabaseAdmin
      .from("images")
      .select("image_url")
      .eq("story_id", story_id)
      .eq("scene_order", scene_order);

    if (fetchImagesError) {
      logger.log(`⚠️ Warning: Could not fetch images for storage cleanup: ${fetchImagesError.message}`);
    }

    // Delete the scene from the database
    let deleteResult;
    if (scene_id) {
      // Delete by scene_id if available
      deleteResult = await supabaseAdmin
        .from("scenes")
        .delete()
        .eq("id", scene_id)
        .eq("story_id", story_id);
    } else {
      // Delete by order if scene_id not available
      deleteResult = await supabaseAdmin
        .from("scenes")
        .delete()
        .eq("story_id", story_id)
        .eq("order", scene_order);
    }

    if (deleteResult.error) {
      throw new Error(`Failed to delete scene: ${deleteResult.error.message}`);
    }

    logger.log("✅ Scene deleted from database");

    // 2️⃣ Delete audio file from storage
    if (sceneData?.audio_url && scene_id) {
      try {
        const audioFileName = `scene-${scene_id}.mp3`;
        logger.log(`🎵 Deleting audio file: ${audioFileName}`);

        const { error: audioStorageError } = await supabaseAdmin.storage
          .from("audio")
          .remove([audioFileName]);

        if (audioStorageError) {
          logger.log(`⚠️ Warning: Could not delete audio file: ${audioStorageError.message}`);
        } else {
          logger.log(`✅ Audio file deleted: ${audioFileName}`);
        }
      } catch (audioErr) {
        logger.log(`⚠️ Warning: Error deleting audio: ${audioErr instanceof Error ? audioErr.message : 'Unknown'}`);
      }
    }

    // 3️⃣ Delete image file from storage
    if (sceneData?.image_url) {
      try {
        const imagePath = sceneData.image_url.split("/images/")[1];
        if (imagePath) {
          logger.log(`🖼️ Deleting image file: ${imagePath}`);

          const { error: imageStorageError } = await supabaseAdmin.storage
            .from("images")
            .remove([imagePath]);

          if (imageStorageError) {
            logger.log(`⚠️ Warning: Could not delete image file: ${imageStorageError.message}`);
          } else {
            logger.log(`✅ Image file deleted: ${imagePath}`);
          }
        }
      } catch (imageErr) {
        logger.log(`⚠️ Warning: Error deleting image: ${imageErr instanceof Error ? imageErr.message : 'Unknown'}`);
      }
    }

    // Delete associated images from database
    const imageDeleteResult = await supabaseAdmin
      .from("images")
      .delete()
      .eq("story_id", story_id)
      .eq("scene_order", scene_order);

    if (imageDeleteResult.error) {
      logger.log(`⚠️ Warning: Could not delete associated images: ${imageDeleteResult.error.message}`);
    }

    // Delete image files from Supabase storage
    if (imagesToDelete && imagesToDelete.length > 0) {
      for (const image of imagesToDelete) {
        if (image.image_url) {
          try {
            // Extract file path from URL (assuming format: bucket_url/storage/v1/object/public/story-assets/images/filename)
            const url = new URL(image.image_url);
            const pathParts = url.pathname.split('/');
            const fileIndex = pathParts.findIndex(part => part === 'story-assets');
            
            if (fileIndex !== -1 && fileIndex < pathParts.length - 1) {
              const filePath = pathParts.slice(fileIndex + 1).join('/');
              
              const { error: storageError } = await supabaseAdmin.storage
                .from('story-assets')
                .remove([filePath]);
              
              if (storageError) {
                logger.log(`⚠️ Warning: Could not delete storage file ${filePath}: ${storageError.message}`);
              } else {
                logger.log(`🗑️ Deleted storage file: ${filePath}`);
              }
            }
          } catch (storageErr) {
            logger.log(`⚠️ Warning: Could not parse image URL for storage deletion: ${image.image_url}`);
          }
        }
      }
    }

    // Reorder remaining scenes
    const { data: remainingScenes, error: fetchError } = await supabaseAdmin
      .from("scenes")
      .select("id, order")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (fetchError) {
      logger.log(`⚠️ Warning: Could not fetch remaining scenes for reordering: ${fetchError.message}`);
    } else if (remainingScenes) {
      // Update the order of remaining scenes
      for (let i = 0; i < remainingScenes.length; i++) {
        const scene = remainingScenes[i];
        if (scene.order !== i) {
          await supabaseAdmin
            .from("scenes")
            .update({ order: i })
            .eq("id", scene.id);
        }
      }

      // Also reorder images
      const { data: remainingImages } = await supabaseAdmin
        .from("images")
        .select("id, scene_order")
        .eq("story_id", story_id)
        .order("scene_order", { ascending: true });

      if (remainingImages) {
        for (let i = 0; i < remainingImages.length; i++) {
          const image = remainingImages[i];
          if (image.scene_order !== i) {
            await supabaseAdmin
              .from("images")
              .update({ scene_order: i })
              .eq("id", image.id);
          }
        }
      }
    }

    logger.log("✅ Scene deleted and remaining scenes reordered successfully");

    res.status(200).json({ 
      success: true, 
      message: "Scene deleted successfully" 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Delete scene error:", error);
    
    if (logger) {
      logger.log(`❌ Scene deletion failed: ${errorMessage}`);
    }

    res.status(500).json({ 
      error: errorMessage 
    });
  }
}