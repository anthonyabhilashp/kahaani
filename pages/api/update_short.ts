import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { short_id, start_time, end_time } = req.body;

  if (!short_id || start_time === undefined || end_time === undefined) {
    return res.status(400).json({ error: 'short_id, start_time, and end_time are required' });
  }

  if (start_time < 0 || end_time <= start_time) {
    return res.status(400).json({ error: 'Invalid time range' });
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

    // Calculate new duration
    const duration = end_time - start_time;

    // Update the short (word_timestamps stay as absolute times, frontend filters them)
    const { data: updatedShort, error } = await supabaseAdmin
      .from('shorts')
      .update({
        start_time,
        end_time,
        duration,
        updated_at: new Date().toISOString()
      })
      .eq('id', short_id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update short: ${error.message}`);
    }

    return res.status(200).json({
      success: true,
      short: updatedShort
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update short" });
  }
}
