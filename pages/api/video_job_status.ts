import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { job_id } = req.query;

  if (!job_id || typeof job_id !== "string") {
    return res.status(400).json({ error: "job_id required" });
  }

  try {
    const { data: job, error } = await supabaseAdmin
      .from("video_generation_jobs")
      .select("id, story_id, status, progress, error, completed_at")
      .eq("id", job_id)
      .single();

    if (error || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.status(200).json(job);
  } catch (err: any) {
    console.error("Error fetching job status:", err);
    res.status(500).json({ error: err.message || "Failed to get job status" });
  }
}
