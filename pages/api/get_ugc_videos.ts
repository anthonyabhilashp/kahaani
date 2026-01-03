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

    // 📄 Pagination parameters
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Fetch UGC videos with clip count
    const { data: ugcVideos, error: queryError, count } = await supabaseAdmin
      .from("ugc_videos")
      .select("*, ugc_clips(count)", { count: 'exact' })
      .eq('user_id', user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (queryError) throw queryError;

    // Transform the response to include clip count
    const enrichedVideos = (ugcVideos || []).map(video => ({
      ...video,
      clip_count: video.ugc_clips?.[0]?.count || 0
    }));

    res.status(200).json({
      videos: enrichedVideos,
      total: count || 0,
      hasMore: (offset + limit) < (count || 0)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
