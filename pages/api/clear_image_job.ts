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
    console.log(`🧹 Cancelling image generation job for story: ${story_id}`);

    // Find any processing jobs for this story
    const { data: existingJobs } = await supabaseAdmin
      .from('image_generation_jobs')
      .select('id, started_at')
      .eq('story_id', story_id)
      .eq('status', 'processing');

    if (existingJobs && existingJobs.length > 0) {
      // Mark all jobs as failed (cancelled)
      const { error: updateError } = await supabaseAdmin
        .from('image_generation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: 'Cancelled by user'
        })
        .eq('story_id', story_id)
        .eq('status', 'processing');

      if (updateError) {
        console.error('Failed to cancel jobs:', updateError);
        return res.status(500).json({ error: 'Failed to cancel jobs' });
      }

      console.log(`✅ Cancelled ${existingJobs.length} image generation job(s) for story ${story_id}`);
      return res.status(200).json({
        message: `Cancelled ${existingJobs.length} job(s)`,
        cleared_count: existingJobs.length
      });
    } else {
      console.log(`ℹ️ No image generation jobs found for story ${story_id}`);
      return res.status(200).json({
        message: 'No jobs found',
        cleared_count: 0
      });
    }
  } catch (err: any) {
    console.error('Error clearing image job:', err);
    return res.status(500).json({ error: err.message || 'Failed to clear job' });
  }
}
