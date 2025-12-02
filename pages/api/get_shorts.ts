import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scene_id } = req.query;

  if (!scene_id) {
    return res.status(400).json({ error: 'scene_id is required' });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    // Fetch shorts for this scene
    const { data: shorts, error } = await supabaseAdmin
      .from('shorts')
      .select('*')
      .eq('scene_id', scene_id)
      .order('order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch shorts: ${error.message}`);
    }

    return res.status(200).json({
      success: true,
      shorts: shorts || []
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch shorts" });
  }
}
