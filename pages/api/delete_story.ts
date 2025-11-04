import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getUserLogger } from "../../lib/userLogger";

// Helper function to recalculate and update series story count
async function updateSeriesStoryCount(seriesId: string, logger?: any): Promise<void> {
  // Count actual stories in this series
  const { count, error: countError } = await supabaseAdmin
    .from("stories")
    .select("*", { count: "exact", head: true })
    .eq("series_id", seriesId);

  if (countError) {
    const msg = `Failed to count stories for series ${seriesId}: ${countError.message}`;
    console.error(msg);
    if (logger) logger.warn(`⚠️ ${msg}`);
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
    const msg = `Failed to update series ${seriesId} count: ${updateError.message}`;
    console.error(msg);
    if (logger) logger.warn(`⚠️ ${msg}`);
  } else if (logger) {
    logger.info(`✅ Updated series ${seriesId} story count to ${count || 0}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id } = req.body;

  if (!story_id) {
    return res.status(400).json({ error: "story_id is required" });
  }

  try {
    // Get user_id from story for logging
    const { data: storyData } = await supabaseAdmin
      .from("stories")
      .select("user_id")
      .eq("id", story_id)
      .single();

    const logger = storyData?.user_id ? getUserLogger(storyData.user_id) : null;
    logger?.info(`[${story_id}] 🗑️ Starting deletion of story`);

    // 1️⃣ Get all scenes to delete their media files
    const { data: scenes, error: scenesError } = await supabaseAdmin
      .from("scenes")
      .select("id, image_url, audio_url")
      .eq("story_id", story_id);

    if (scenesError) {
      throw new Error(`Failed to fetch scenes: ${scenesError.message}`);
    }

    logger?.log(`📦 Found ${scenes?.length || 0} scenes to delete`);

    // 2️⃣ Delete audio files from storage
    if (scenes && scenes.length > 0) {
      for (const scene of scenes) {
        if (scene.audio_url && scene.id) {
          try {
            const audioFileName = `scene-${scene.id}.mp3`;
            logger?.info(`[${story_id}] 🎵 Deleting audio file: ${audioFileName}`);

            const { error: audioStorageError } = await supabaseAdmin.storage
              .from("audio")
              .remove([audioFileName]);

            if (audioStorageError) {
              logger?.info(`[${story_id}] ⚠️ Warning: Could not delete audio file: ${audioStorageError.message}`);
            } else {
              logger?.info(`[${story_id}] ✅ Audio file deleted: ${audioFileName}`);
            }
          } catch (audioErr) {
            logger?.info(`[${story_id}] ⚠️ Warning: Error deleting audio: ${audioErr instanceof Error ? audioErr.message : 'Unknown'}`);
          }
        }

        // Delete scene image from storage
        if (scene.image_url) {
          try {
            const imagePath = scene.image_url.split("/images/")[1];
            if (imagePath) {
              logger?.info(`[${story_id}] 🖼️ Deleting scene image: ${imagePath}`);

              const { error: imageStorageError } = await supabaseAdmin.storage
                .from("images")
                .remove([imagePath]);

              if (imageStorageError) {
                logger?.info(`[${story_id}] ⚠️ Warning: Could not delete image file: ${imageStorageError.message}`);
              } else {
                logger?.info(`[${story_id}] ✅ Image file deleted: ${imagePath}`);
              }
            }
          } catch (imageErr) {
            logger?.info(`[${story_id}] ⚠️ Warning: Error deleting image: ${imageErr instanceof Error ? imageErr.message : 'Unknown'}`);
          }
        }
      }
    }

    // 3️⃣ Delete images from the images table and storage
    const { data: images, error: imagesError } = await supabaseAdmin
      .from("images")
      .select("image_url")
      .eq("story_id", story_id);

    if (imagesError) {
      logger?.info(`[${story_id}] ⚠️ Warning: Could not fetch images: ${imagesError.message}`);
    } else if (images && images.length > 0) {
      logger?.info(`[${story_id}] 🖼️ Found ${images.length} additional images to delete`);

      for (const image of images) {
        if (image.image_url) {
          try {
            const url = new URL(image.image_url);
            const pathParts = url.pathname.split('/');
            const fileIndex = pathParts.findIndex(part => part === 'story-assets' || part === 'images');

            if (fileIndex !== -1 && fileIndex < pathParts.length - 1) {
              const bucketName = pathParts[fileIndex] === 'story-assets' ? 'story-assets' : 'images';
              const filePath = pathParts.slice(fileIndex + 1).join('/');

              const { error: storageError } = await supabaseAdmin.storage
                .from(bucketName)
                .remove([filePath]);

              if (storageError) {
                logger?.info(`[${story_id}] ⚠️ Warning: Could not delete storage file ${filePath}: ${storageError.message}`);
              } else {
                logger?.info(`[${story_id}] ✅ Deleted storage file: ${filePath}`);
              }
            }
          } catch (storageErr) {
            logger?.info(`[${story_id}] ⚠️ Warning: Could not parse image URL for storage deletion: ${image.image_url}`);
          }
        }
      }
    }

    // 4️⃣ Delete videos from storage
    const { data: videos, error: videosError } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .eq("story_id", story_id);

    if (videosError) {
      logger?.info(`[${story_id}] ⚠️ Warning: Could not fetch videos: ${videosError.message}`);
    } else if (videos && videos.length > 0) {
      logger?.info(`[${story_id}] 🎬 Found ${videos.length} videos to delete`);

      for (const video of videos) {
        if (video.video_url) {
          try {
            const url = new URL(video.video_url);
            const pathParts = url.pathname.split('/');
            const fileIndex = pathParts.findIndex(part => part === 'videos');

            if (fileIndex !== -1 && fileIndex < pathParts.length - 1) {
              const filePath = pathParts.slice(fileIndex + 1).join('/');

              const { error: storageError } = await supabaseAdmin.storage
                .from('videos')
                .remove([filePath]);

              if (storageError) {
                logger?.info(`[${story_id}] ⚠️ Warning: Could not delete video file ${filePath}: ${storageError.message}`);
              } else {
                logger?.info(`[${story_id}] ✅ Deleted video file: ${filePath}`);
              }
            }
          } catch (storageErr) {
            logger?.info(`[${story_id}] ⚠️ Warning: Could not parse video URL for storage deletion: ${video.video_url}`);
          }
        }
      }
    }

    // 5️⃣ Delete from database tables (in order due to foreign key constraints)

    // Delete audio records
    const { error: audioDbError } = await supabaseAdmin
      .from("audio")
      .delete()
      .eq("story_id", story_id);

    if (audioDbError) {
      logger?.info(`[${story_id}] ⚠️ Warning: Could not delete audio records: ${audioDbError.message}`);
    } else {
      logger?.info(`[${story_id}] ✅ Audio records deleted from database`);
    }

    // Delete image records
    const { error: imageDbError } = await supabaseAdmin
      .from("images")
      .delete()
      .eq("story_id", story_id);

    if (imageDbError) {
      logger?.info(`[${story_id}] ⚠️ Warning: Could not delete image records: ${imageDbError.message}`);
    } else {
      logger?.info(`[${story_id}] ✅ Image records deleted from database`);
    }

    // Delete video records
    const { error: videoDbError } = await supabaseAdmin
      .from("videos")
      .delete()
      .eq("story_id", story_id);

    if (videoDbError) {
      logger?.info(`[${story_id}] ⚠️ Warning: Could not delete video records: ${videoDbError.message}`);
    } else {
      logger?.info(`[${story_id}] ✅ Video records deleted from database`);
    }

    // Delete scenes
    const { error: scenesDbError } = await supabaseAdmin
      .from("scenes")
      .delete()
      .eq("story_id", story_id);

    if (scenesDbError) {
      throw new Error(`Failed to delete scenes: ${scenesDbError.message}`);
    }
    logger?.log("✅ Scenes deleted from database");

    // 6️⃣ Get story's series_id before deletion to update series count
    const { data: storySeriesData, error: storyFetchError } = await supabaseAdmin
      .from("stories")
      .select("series_id")
      .eq("id", story_id)
      .single();

    if (storyFetchError) {
      logger?.info(`[${story_id}] ⚠️ Warning: Could not fetch story series_id: ${storyFetchError.message}`);
    }

    const seriesId = storySeriesData?.series_id;

    // 7️⃣ Delete the story itself
    const { error: storyError } = await supabaseAdmin
      .from("stories")
      .delete()
      .eq("id", story_id);

    if (storyError) {
      throw new Error(`Failed to delete story: ${storyError.message}`);
    }

    logger?.log("✅ Story deleted successfully");

    // 8️⃣ Recalculate series story count if story was in a series (async, non-blocking)
    if (seriesId) {
      updateSeriesStoryCount(seriesId, logger).catch(err => {
        const msg = `Failed to update series ${seriesId} count: ${err.message}`;
        console.error(msg);
        if (logger) logger.warn(`[${story_id}] ⚠️ ${msg}`);
      });
    }

    res.status(200).json({
      success: true,
      message: "Story and all associated data deleted successfully"
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${story_id}] Delete story error:`, error);

    res.status(500).json({
      error: errorMessage
    });
  }
}
