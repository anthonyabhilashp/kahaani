import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing story id" });

  try {
    // Try to fetch with background music support first
    let storyResult = await supabaseAdmin.from("stories").select(`
      id, title, prompt, status, created_at, updated_at, voice_id, aspect_ratio, default_image_style, image_instructions, caption_settings,
      background_music_id, background_music_volume, background_music_enabled,
      background_music:background_music_library(id, name, description, file_url, duration, category)
    `).eq("id", id).single();

    // If background music query fails (columns don't exist), fallback to basic query
    if (storyResult.error) {
      console.warn("⚠️ Background music columns not found, using basic query:", storyResult.error.message);
      storyResult = await supabaseAdmin.from("stories").select("*").eq("id", id).single();
    }

    const [{ data: scenes }, { data: videoRows, error: videoErr }] =
      await Promise.all([
        supabaseAdmin.from("scenes").select("id, story_id, text, order, image_url, audio_url, voice_id, duration, word_timestamps, last_modified_at, created_at, image_generated_at, audio_generated_at, scene_text_modified_at, effects").eq("story_id", id).order("order"),
        supabaseAdmin
          .from("videos")
          .select("*")
          .eq("story_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    // ✅ normalize video (ensure object or null)
    const video = videoRows?.[0] || null;

    if (videoErr) console.warn("⚠️ videoErr:", videoErr);

    const story = storyResult.data;

    // Build background_music_settings object for backward compatibility
    // Note: background_music is an array from Supabase join, so we need to access [0]
    const bgMusic = Array.isArray(story?.background_music) ? story.background_music[0] : story?.background_music;
    const background_music_settings = story?.background_music_id ? {
      music_id: story.background_music_id,
      music_url: bgMusic?.file_url || null,
      music_name: bgMusic?.name || null,
      volume: story.background_music_volume ?? 30,
      enabled: story.background_music_enabled ?? false,
    } : null;

    // 🎯 Return simplified structure - scenes contain all their media info
    res.status(200).json({
      story: {
        ...story,
        background_music_settings,
      },
      scenes: scenes || [],
      video
    });
  } catch (err: any) {
    console.error("❌ Error in get_story_details:", err);
    res.status(500).json({ error: err.message });
  }
}
