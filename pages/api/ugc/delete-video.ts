import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ugc_video_id } = req.body;

  if (!ugc_video_id) {
    return res.status(400).json({ error: "ugc_video_id is required" });
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
    logger.info(`[UGC] Deleting video: ${ugc_video_id}`);

    // 🔒 Verify ownership
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('id, user_id, video_url')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      logger.error(`Video not found: ${videoError?.message}`);
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      logger.error(`Unauthorized access attempt by user ${user.id}`);
      return res.status(403).json({ error: "Forbidden" });
    }

    // 🗑️ Delete clips first (foreign key constraint)
    const { error: clipsDeleteError } = await supabaseAdmin
      .from('ugc_clips')
      .delete()
      .eq('ugc_video_id', ugc_video_id);

    if (clipsDeleteError) {
      logger.error(`Failed to delete clips: ${clipsDeleteError.message}`);
      // Continue anyway - video record is more important
    } else {
      logger.info(`Deleted clips for video ${ugc_video_id}`);
    }

    // 🗑️ Delete audio files from storage
    try {
      const { data: audioFiles } = await supabaseAdmin
        .storage
        .from('audio')
        .list(`ugc_audio/${ugc_video_id}`);

      if (audioFiles && audioFiles.length > 0) {
        const filePaths = audioFiles.map(file => `ugc_audio/${ugc_video_id}/${file.name}`);
        const { error: audioDeleteError } = await supabaseAdmin
          .storage
          .from('audio')
          .remove(filePaths);

        if (audioDeleteError) {
          logger.error(`Failed to delete audio files: ${audioDeleteError.message}`);
        } else {
          logger.info(`Deleted ${filePaths.length} audio files`);
        }
      }
    } catch (error: any) {
      logger.error(`Error deleting audio files: ${error.message}`);
      // Continue anyway
    }

    // 🗑️ Delete video record from database
    const { error: deleteError } = await supabaseAdmin
      .from('ugc_videos')
      .delete()
      .eq('id', ugc_video_id);

    if (deleteError) {
      logger.error(`Failed to delete video record: ${deleteError.message}`);
      return res.status(500).json({ error: "Failed to delete video", details: deleteError.message });
    }

    logger.info(`✅ Successfully deleted UGC video ${ugc_video_id}`);

    return res.status(200).json({
      success: true,
      message: "UGC video deleted successfully"
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Delete failed: ${error.message}`);
      logger.error(error.stack);
    }

    return res.status(500).json({
      error: "Failed to delete UGC video",
      details: error.message
    });
  }
}
