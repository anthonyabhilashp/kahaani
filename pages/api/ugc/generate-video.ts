import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";
import { UGC_DEFAULTS } from "../../../lib/ugcPresets";

/**
 * UGC Video Generation Endpoint
 *
 * This is a lightweight wrapper that prepares UGC data and delegates to
 * the existing generate_video.ts pipeline by converting UGC clips to scenes format.
 *
 * The actual video assembly happens in /api/generate_video.ts which handles:
 * - FFmpeg processing
 * - Caption generation (ASS subtitles)
 * - Concat filter for mixed frame rates
 * - Watermark overlay
 * - Background music mixing
 */

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
    logger.info(`[UGC] Starting video generation for: ${ugc_video_id}`);

    // 🔒 Verify ownership and get UGC video
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('*, ugc_clips(*)')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ✅ Validate all clips have media and audio
    const clips = ugcVideo.ugc_clips || [];
    if (clips.length === 0) {
      return res.status(400).json({ error: "No clips found" });
    }

    const missingMedia = clips.filter((c: any) => !c.media_url);
    const missingAudio = clips.filter((c: any) => !c.audio_url);

    if (missingMedia.length > 0) {
      return res.status(400).json({
        error: `${missingMedia.length} clip(s) missing media. Please select media first.`,
        missing_clips: missingMedia.map((c: any) => c.order_index)
      });
    }

    if (missingAudio.length > 0) {
      return res.status(400).json({
        error: `${missingAudio.length} clip(s) missing audio. Please generate audio first.`,
        missing_clips: missingAudio.map((c: any) => c.order_index)
      });
    }

    logger.info(`All ${clips.length} clips have media and audio - ready for video generation`);

    // 🎬 Create a temporary story + scenes to leverage existing pipeline
    // This approach reuses the battle-tested generate_video.ts logic
    // Use ugc_video_id directly as story_id (it's already a valid UUID)

    const tempStoryId = ugcVideo.id;

    // Create temporary story record
    const { error: storyError } = await supabaseAdmin
      .from('stories')
      .upsert({
        id: tempStoryId,
        user_id: user.id,
        title: ugcVideo.title,
        prompt: ugcVideo.input_text,
        status: 'processing',
        voice_id: ugcVideo.voice_id,
        aspect_ratio: ugcVideo.aspect_ratio,
        caption_settings: ugcVideo.caption_settings,
        background_music_enabled: ugcVideo.background_music_enabled,
        background_music_id: ugcVideo.background_music_id,
        background_music_volume: ugcVideo.background_music_volume
      }, {
        onConflict: 'id'
      });

    if (storyError) {
      logger.error(`Failed to create temp story: ${storyError.message}`);
      throw storyError;
    }

    // Convert UGC clips to scenes format
    // Use clip IDs directly as scene IDs (they're already UUIDs)
    const sceneInserts = clips.map((clip: any) => ({
      id: clip.id,
      story_id: tempStoryId,
      order: clip.order_index,
      text: clip.text,
      duration: clip.duration,
      image_url: clip.media_type === 'ai_image' ? clip.media_url : null,
      video_url: (clip.media_type === 'stock_video' || clip.media_type === 'uploaded_video') ? clip.media_url : null,
      audio_url: clip.audio_url,
      voice_id: ugcVideo.voice_id,
      word_timestamps: clip.word_timestamps,
      effects: {
        motion: UGC_DEFAULTS.video_effect,
        overlay_url: null,
        overlay_id: null
      }
    }));

    // Delete existing temp scenes and insert new ones
    await supabaseAdmin.from('scenes').delete().eq('story_id', tempStoryId);

    const { error: scenesError } = await supabaseAdmin
      .from('scenes')
      .insert(sceneInserts);

    if (scenesError) {
      logger.error(`Failed to create temp scenes: ${scenesError.message}`);
      throw scenesError;
    }

    logger.info(`Created ${sceneInserts.length} temporary scenes for video generation`);

    // 🎥 Delegate to existing video generation pipeline
    // This will handle all the complex FFmpeg logic, captions, concat, etc.
    // Construct proper API URL dynamically based on current request
    const protocol = req.headers['x-forwarded-proto'] || (req.headers['host']?.includes('localhost') ? 'http' : 'https');
    const host = req.headers['host'];

    if (!host) {
      throw new Error('Unable to determine host for API call');
    }

    const apiUrl = `${protocol}://${host}/api/generate_video`;
    logger.info(`Calling video generation API: ${apiUrl}`);

    const videoGenResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        story_id: tempStoryId,
        aspect_ratio: ugcVideo.aspect_ratio,
        caption_settings: ugcVideo.caption_settings
      })
    });

    if (!videoGenResponse.ok) {
      const errorData = await videoGenResponse.json();
      logger.error(`Video generation failed: ${JSON.stringify(errorData)}`);
      throw new Error(errorData.error || 'Video generation failed');
    }

    const videoData = await videoGenResponse.json();
    logger.info(`Video generation initiated. Job ID: ${videoData.job_id || 'N/A'}`);

    // Update UGC video status
    await supabaseAdmin
      .from('ugc_videos')
      .update({ status: 'processing' })
      .eq('id', ugc_video_id);

    // Return job info for polling
    return res.status(202).json({
      message: "Video generation started",
      ugc_video_id,
      temp_story_id: tempStoryId,
      job_id: videoData.job_id,
      status: "processing",
      poll_url: `/api/video_job_status?story_id=${tempStoryId}`
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`UGC video generation failed: ${error.message}`);
      logger.error(error.stack);
    }

    return res.status(500).json({
      error: "Failed to generate video",
      details: error.message
    });
  }
}
