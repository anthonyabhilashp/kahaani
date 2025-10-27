import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Fetch all stories
    const { data: stories, error } = await supabaseAdmin
      .from("stories")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Enrich each story with first scene image and metadata
    const enrichedStories = await Promise.all(
      (stories || []).map(async (story) => {
        // Get first scene image (ordered by scene order)
        const { data: firstScene } = await supabaseAdmin
          .from("scenes")
          .select("image_url")
          .eq("story_id", story.id)
          .order("order", { ascending: true })
          .limit(1)
          .single();

        // Get scene count
        const { count: sceneCount } = await supabaseAdmin
          .from("scenes")
          .select("*", { count: "exact", head: true })
          .eq("story_id", story.id);

        // Get latest video metadata
        const { data: video } = await supabaseAdmin
          .from("videos")
          .select("duration, video_url, created_at")
          .eq("story_id", story.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // Use stored total_duration from story, fallback to video duration or 0
        const totalDuration = story.total_duration || video?.duration || 0;

        return {
          ...story,
          first_scene_image: firstScene?.image_url || null,
          scene_count: sceneCount || 0,
          video_duration: totalDuration,
          video_url: video?.video_url || null,
          video_created_at: video?.created_at || null,
        };
      })
    );

    res.status(200).json(enrichedStories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
