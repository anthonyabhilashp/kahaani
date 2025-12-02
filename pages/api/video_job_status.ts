import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { job_id, story_id } = req.query;

  // Must provide either job_id or story_id
  if ((!job_id || typeof job_id !== "string") && (!story_id || typeof story_id !== "string")) {
    return res.status(400).json({ error: "job_id or story_id required" });
  }

  try {
    let query = supabaseAdmin.from("video_generation_jobs").select("*");

    if (job_id && typeof job_id === "string") {
      // Query by job_id
      query = query.eq("id", job_id).single();
    } else if (story_id && typeof story_id === "string") {
      // Query by story_id - get latest processing job
      query = query.eq("story_id", story_id).eq("status", "processing").order("started_at", { ascending: false }).limit(1).maybeSingle();
    }

    const { data: job, error } = await query;

    if (error) {
      console.error("Error fetching job:", error);
      return res.status(404).json({ error: "Job not found", details: error.message });
    }

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.status(200).json(job);
  } catch (err: any) {
    console.error("Error fetching job status:", err);
    res.status(500).json({ error: err.message || "Failed to get job status" });
  }
}
