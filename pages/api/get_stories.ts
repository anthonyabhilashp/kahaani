import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 🔐 Get authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    const isAdmin = userData?.is_admin === true;

    // 🚀 OPTIMIZED: Use VIEW to get all data in ONE query
    // This replaces 3 queries per story with 1 query total
    let viewQuery = supabaseAdmin
      .from("stories_dashboard")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!isAdmin) {
      viewQuery = viewQuery.eq('user_id', user.id);
    }

    const { data: rawData, error: queryError } = await viewQuery;

    if (queryError) {
      // Fallback to old method if view doesn't exist
      console.warn('Optimized view not available, using fallback:', queryError.message);

      let query = supabaseAdmin
        .from("stories")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50); // Limit to 50 stories for performance

      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data: stories, error } = await query;
      if (error) throw error;

      // Simplified enrichment - get scene counts and first images in batch
      const storyIds = (stories || []).map(s => s.id);

      // Get all first scenes in one query
      const { data: firstScenes } = await supabaseAdmin
        .from("scenes")
        .select("story_id, image_url")
        .in("story_id", storyIds)
        .order("order", { ascending: true });

      // Get all videos in one query
      const { data: videos } = await supabaseAdmin
        .from("videos")
        .select("story_id, duration, video_url, created_at")
        .in("story_id", storyIds);

      // Group by story_id
      const firstSceneMap = new Map();
      firstScenes?.forEach(scene => {
        if (!firstSceneMap.has(scene.story_id)) {
          firstSceneMap.set(scene.story_id, scene.image_url);
        }
      });

      const videoMap = new Map();
      videos?.forEach(video => {
        if (!videoMap.has(video.story_id)) {
          videoMap.set(video.story_id, video);
        }
      });

      const enrichedStories = (stories || []).map(story => {
        const video = videoMap.get(story.id);
        const totalDuration = story.total_duration || video?.duration || 0;

        return {
          ...story,
          first_scene_image: firstSceneMap.get(story.id) || null,
          scene_count: story.scene_count || 0,
          video_duration: totalDuration,
          video_url: video?.video_url || null,
          video_created_at: video?.created_at || null,
        };
      });

      return res.status(200).json(enrichedStories);
    }

    // Use optimized function result
    res.status(200).json(rawData || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
