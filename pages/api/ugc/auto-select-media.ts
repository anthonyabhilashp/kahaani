import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";
import { deductCredits } from "../../../lib/credits";
import { extractKeywords } from "../../../lib/ugcPresets";

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const PIXABAY_VIDEO_URL = "https://pixabay.com/api/videos/";
const PIXABAY_IMAGE_URL = "https://pixabay.com/api/";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ugc_video_id, media_source = 'stock_video' } = req.body;

  if (!ugc_video_id) {
    return res.status(400).json({ error: "ugc_video_id is required" });
  }

  if (!PIXABAY_API_KEY) {
    return res.status(500).json({ error: "Pixabay API key not configured" });
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
    logger.info(`[UGC] Auto-selecting ${media_source} for video: ${ugc_video_id}`);

    // 🔒 Verify ownership and get clips
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('id, user_id, title')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 💳 Check credits
    const MEDIA_SELECTION_COST = 1;
    const { data: userCredits } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!userCredits || userCredits.balance < MEDIA_SELECTION_COST) {
      logger.warn(`Insufficient credits. Balance: ${userCredits?.balance || 0}`);
      return res.status(402).json({
        error: "Insufficient credits",
        balance: userCredits?.balance || 0,
        required: MEDIA_SELECTION_COST
      });
    }

    // 📋 Get all clips
    const { data: clips, error: clipsError } = await supabaseAdmin
      .from('ugc_clips')
      .select('*')
      .eq('ugc_video_id', ugc_video_id)
      .order('order_index', { ascending: true });

    if (clipsError || !clips || clips.length === 0) {
      logger.error(`No clips found for video ${ugc_video_id}`);
      return res.status(404).json({ error: "No clips found" });
    }

    logger.info(`Found ${clips.length} clips to populate with media`);

    // 🎬 Auto-select media for each clip
    const updatedClips = [];
    const isVideo = media_source === 'stock_video';

    for (const clip of clips) {
      // Extract keywords from clip text
      const keywords = extractKeywords(clip.text, 3);
      const query = keywords.join(' ') || 'nature'; // Fallback if no keywords

      logger.info(`Clip ${clip.order_index}: Searching for "${query}"`);

      try {
        // Search Pixabay
        const searchUrl = isVideo ? PIXABAY_VIDEO_URL : PIXABAY_IMAGE_URL;
        const response = await fetch(
          `${searchUrl}?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=3&orientation=vertical`
        );

        if (!response.ok) {
          logger.warn(`Pixabay API error for "${query}": ${response.status}`);
          continue;
        }

        const data: any = await response.json();

        let mediaUrl = null;

        if (isVideo && data.hits && data.hits.length > 0) {
          // Get the highest quality portrait video
          const video = data.hits[0];
          // Pixabay returns videos object with different sizes
          mediaUrl = video.videos?.large?.url || video.videos?.medium?.url || video.videos?.small?.url;
        } else if (!isVideo && data.hits && data.hits.length > 0) {
          // Get large portrait photo
          mediaUrl = data.hits[0].largeImageURL || data.hits[0].webformatURL;
        }

        if (mediaUrl) {
          // Update clip with media URL
          const { error: updateError } = await supabaseAdmin
            .from('ugc_clips')
            .update({
              media_type: media_source,
              media_url: mediaUrl
            })
            .eq('id', clip.id);

          if (!updateError) {
            updatedClips.push({
              id: clip.id,
              order_index: clip.order_index,
              media_url: mediaUrl,
              media_type: media_source,
              keywords: keywords
            });
            logger.info(`✓ Clip ${clip.order_index}: ${mediaUrl}`);
          } else {
            logger.error(`Failed to update clip ${clip.id}: ${updateError.message}`);
          }
        } else {
          logger.warn(`No media found for "${query}"`);
        }

      } catch (error: any) {
        logger.error(`Error searching for clip ${clip.order_index}: ${error.message}`);
      }
    }

    // 💳 Deduct credits AFTER successful selection
    const deductResult = await deductCredits(
      user.id,
      MEDIA_SELECTION_COST,
      `ugc_media_selection`,
      `UGC Media Selection: ${ugcVideo.title}`
    );

    if (!deductResult.success) {
      logger.error(`Credit deduction failed: ${deductResult.error}`);
    }

    logger.info(`✅ Media auto-selection complete. ${updatedClips.length}/${clips.length} clips populated`);

    return res.status(200).json({
      success: true,
      ugc_video_id,
      clips: updatedClips,
      media_source,
      credits_deducted: MEDIA_SELECTION_COST,
      credits_remaining: deductResult.newBalance
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Media auto-selection failed: ${error.message}`);
    }

    return res.status(500).json({
      error: "Failed to auto-select media",
      details: error.message
    });
  }
}
