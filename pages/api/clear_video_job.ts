import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { story_id } = req.body;
  if (!story_id) {
    return res.status(400).json({ error: "story_id required" });
  }

  try {
    console.log(`🧹 Clearing stuck video generation job for story: ${story_id}`);

    // Find any processing jobs for this story
    const { data: existingJobs } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('id, started_at')
      .eq('story_id', story_id)
      .eq('status', 'processing');

    if (existingJobs && existingJobs.length > 0) {
      // Mark all stuck jobs as failed
      const { error: updateError } = await supabaseAdmin
        .from('video_generation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: 'Job cleared by user (stuck job cleanup)'
        })
        .eq('story_id', story_id)
        .eq('status', 'processing');

      if (updateError) {
        console.error('Failed to clear jobs:', updateError);
        return res.status(500).json({ error: 'Failed to clear jobs' });
      }

      console.log(`✅ Cleared ${existingJobs.length} stuck job(s) for story ${story_id}`);
      return res.status(200).json({
        message: `Cleared ${existingJobs.length} stuck job(s)`,
        cleared_count: existingJobs.length
      });
    } else {
      console.log(`ℹ️ No stuck jobs found for story ${story_id}`);
      return res.status(200).json({
        message: 'No stuck jobs found',
        cleared_count: 0
      });
    }
  } catch (err: any) {
    console.error('Error clearing video job:', err);
    return res.status(500).json({ error: err.message || 'Failed to clear job' });
  }
}
