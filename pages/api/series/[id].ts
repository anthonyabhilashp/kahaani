import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const { id } = req.query;

    if (req.method === 'GET') {
      // Get series with episodes
      const { data: series, error: seriesError } = await supabaseAdmin
        .from("series")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (seriesError) throw seriesError;

      // Get all stories in this series using optimized view (most recent first)
      const { data: episodes, error: episodesError } = await supabaseAdmin
        .from("stories_dashboard")
        .select("id, title, status, total_duration, created_at, updated_at, video_url, scene_count, first_scene_image")
        .eq("series_id", id)
        .order("created_at", { ascending: false });

      if (episodesError) throw episodesError;

      return res.status(200).json({
        ...series,
        episodes: episodes || []
      });
    }

    if (req.method === 'PUT') {
      // Update series
      const { title, description, thumbnail_url } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;

      const { data: series, error } = await supabaseAdmin
        .from("series")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(series);
    }

    if (req.method === 'DELETE') {
      // Delete series (stories will have series_id set to NULL due to ON DELETE SET NULL)
      const { error } = await supabaseAdmin
        .from("series")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("Series detail API error:", {
      message: err.message,
      details: err.details,
      hint: err.hint,
      code: err.code,
      stack: err.stack
    });
    res.status(500).json({
      error: err.message,
      details: err.details,
      hint: err.hint,
      code: err.code
    });
  }
}
