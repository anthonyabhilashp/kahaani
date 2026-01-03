import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";
import { estimateDuration } from "../../../lib/viralScriptPrompt";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ugc_video_id, clips } = req.body;

  if (!ugc_video_id) {
    return res.status(400).json({ error: "ugc_video_id is required" });
  }

  if (!clips || !Array.isArray(clips) || clips.length === 0) {
    return res.status(400).json({ error: "clips array is required" });
  }

  let logger: any = null;

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

    logger = getUserLogger(user.id);
    logger.info(`[UGC] Updating script for video: ${ugc_video_id}`);

    // 🔒 Verify ownership
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('id, user_id, title')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      logger.warn(`UGC video not found: ${ugc_video_id}`);
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      logger.warn(`Unauthorized access attempt by ${user.email} to video ${ugc_video_id}`);
      return res.status(403).json({ error: "Forbidden - You don't own this video" });
    }

    // 📝 Update each clip
    let totalDuration = 0;
    const updatedClips = [];

    for (const clip of clips) {
      if (!clip.id || !clip.text) {
        logger.warn(`Invalid clip data: ${JSON.stringify(clip)}`);
        continue;
      }

      // Recalculate duration based on new text
      const newDuration = clip.duration || estimateDuration(clip.text);
      totalDuration += newDuration;

      const { error: updateError } = await supabaseAdmin
        .from('ugc_clips')
        .update({
          text: clip.text,
          duration: newDuration,
          // Mark audio as stale if text changed (will need regeneration)
          audio_url: null,
          word_timestamps: null,
          audio_generated_at: null
        })
        .eq('id', clip.id)
        .eq('ugc_video_id', ugc_video_id); // Extra safety check

      if (updateError) {
        logger.error(`Failed to update clip ${clip.id}: ${updateError.message}`);
        throw updateError;
      }

      updatedClips.push({
        id: clip.id,
        text: clip.text,
        duration: newDuration
      });
    }

    // 🔄 Update total duration in ugc_videos table
    const { error: durationError } = await supabaseAdmin
      .from('ugc_videos')
      .update({
        duration: totalDuration,
        updated_at: new Date().toISOString()
      })
      .eq('id', ugc_video_id);

    if (durationError) {
      logger.error(`Failed to update total duration: ${durationError.message}`);
    }

    logger.info(`✅ Script updated. ${updatedClips.length} clips, total duration: ${totalDuration.toFixed(1)}s`);

    return res.status(200).json({
      success: true,
      ugc_video_id,
      updated_clips: updatedClips,
      total_duration: totalDuration
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Script update failed: ${error.message}`);
    }

    return res.status(500).json({
      error: "Failed to update script",
      details: error.message
    });
  }
}
