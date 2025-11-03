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

    if (req.method === 'GET') {
      // Get all series for user
      const { data: series, error } = await supabaseAdmin
        .from("series")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json(series || []);
    }

    if (req.method === 'POST') {
      // Create new series
      const { title, description, thumbnail_url } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const { data: series, error } = await supabaseAdmin
        .from("series")
        .insert({
          user_id: user.id,
          title,
          description,
          thumbnail_url,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(series);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("Series API error:", err);
    res.status(500).json({ error: err.message });
  }
}
