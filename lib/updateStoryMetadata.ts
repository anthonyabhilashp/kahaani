import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Recalculates and updates story metadata:
 * - total_duration: sum of all scene durations
 * - scene_count: total number of scenes
 * - images_count: number of scenes with images
 * - audio_count: number of scenes with audio
 *
 * Completion can be determined by: images_count >= scene_count, audio_count >= scene_count
 */
export async function updateStoryMetadata(storyId: string) {
  try {
    // Get all scenes for this story
    const { data: scenes, error: scenesError } = await supabaseAdmin
      .from("scenes")
      .select("duration, image_url, audio_url")
      .eq("story_id", storyId);

    if (scenesError) throw scenesError;

    const sceneCount = scenes?.length || 0;

    // Calculate total duration
    const totalDuration = scenes?.reduce((sum, scene) => {
      return sum + (scene.duration || 0);
    }, 0) || 0;

    // Count scenes with images and audio
    const imagesCount = scenes?.filter(scene => scene.image_url).length || 0;
    const audioCount = scenes?.filter(scene => scene.audio_url).length || 0;

    // Update story metadata
    const { error: updateError } = await supabaseAdmin
      .from("stories")
      .update({
        total_duration: totalDuration,
        scene_count: sceneCount,
        images_count: imagesCount,
        audio_count: audioCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storyId);

    if (updateError) throw updateError;

    return {
      total_duration: totalDuration,
      scene_count: sceneCount,
      images_count: imagesCount,
      audio_count: audioCount,
      images_complete: sceneCount > 0 && imagesCount >= sceneCount,
      audio_complete: sceneCount > 0 && audioCount >= sceneCount,
    };
  } catch (error) {
    console.error("Error updating story metadata:", error);
    throw error;
  }
}
