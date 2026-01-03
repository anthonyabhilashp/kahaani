import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";

const HEYGEN_API = "https://api.heygen.com/v2/video/generate";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ugc_video_id, avatar_id, voice_id, resolution = '720p' } = req.body;

  if (!ugc_video_id) {
    return res.status(400).json({ error: "ugc_video_id is required" });
  }

  if (!avatar_id) {
    return res.status(400).json({ error: "avatar_id is required" });
  }

  if (!voice_id) {
    return res.status(400).json({ error: "voice_id is required" });
  }

  const selectedAvatarId = avatar_id;
  const selectedVoiceId = voice_id;

  // Map resolution to dimensions
  const dimensions = resolution === '1080p'
    ? { width: 1080, height: 1920 }  // Full HD - requires Standard plan
    : { width: 720, height: 1280 };   // HD - works with Free plan

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
    logger.info(`[UGC] Generating avatar video for: ${ugc_video_id}`);

    // 🔒 Verify ownership and get video with clips
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('id, user_id, title, script_text, voice_id')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      logger.error(`Video not found: ${videoError?.message}`);
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!ugcVideo.script_text) {
      return res.status(400).json({ error: "No script found. Please generate a script first." });
    }

    logger.info(`Found video: ${ugcVideo.title}`);
    logger.info(`Using resolution: ${resolution} (${dimensions.width}x${dimensions.height})`);

    // 🎬 Generate avatar video with HeyGen API
    const heygenApiKey = process.env.HEYGEN_API_KEY;
    if (!heygenApiKey) {
      logger.error("HEYGEN_API_KEY not configured");
      return res.status(500).json({ error: "HeyGen API key not configured" });
    }

    logger.info(`Calling HeyGen API to generate video with avatar: ${selectedAvatarId}, voice: ${selectedVoiceId}...`);

    const heygenPayload = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: selectedAvatarId,
            avatar_style: "normal"
          },
          voice: {
            type: "text",
            input_text: ugcVideo.script_text,
            voice_id: selectedVoiceId
          }
        }
      ],
      dimension: {
        width: dimensions.width,
        height: dimensions.height
      },
      test: false
    };

    logger.info(`HeyGen payload: ${JSON.stringify(heygenPayload, null, 2)}`);

    const heygenResponse = await fetch(HEYGEN_API, {
      method: "POST",
      headers: {
        "X-Api-Key": heygenApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(heygenPayload)
    });

    const responseText = await heygenResponse.text();
    logger.info(`HeyGen response status: ${heygenResponse.status}`);
    logger.info(`HeyGen response: ${responseText}`);

    if (!heygenResponse.ok) {
      logger.error(`HeyGen API error: ${heygenResponse.status} - ${responseText}`);
      return res.status(500).json({
        error: `HeyGen API error: ${heygenResponse.status}`,
        details: responseText
      });
    }

    const heygenData: any = JSON.parse(responseText);
    const videoId = heygenData.data?.video_id;

    if (!videoId) {
      logger.error("HeyGen did not return a video_id");
      return res.status(500).json({
        error: "HeyGen did not return a video_id",
        response: heygenData
      });
    }

    logger.info(`HeyGen video generation started. Video ID: ${videoId}`);

    // Poll for completion (HeyGen videos take time to generate)
    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5s intervals)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s

      const statusResponse = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
        headers: {
          "X-Api-Key": heygenApiKey
        }
      });

      if (statusResponse.ok) {
        const statusData: any = await statusResponse.json();
        const status = statusData.data?.status;

        logger.info(`HeyGen video status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

        // Log full status data on first check or when status changes
        if (attempts === 0 || status === 'failed') {
          logger.info(`Full status response: ${JSON.stringify(statusData, null, 2)}`);
        }

        if (status === 'completed') {
          videoUrl = statusData.data?.video_url;
          break;
        } else if (status === 'failed') {
          const errorObj = statusData.data?.error || statusData.data || 'Unknown error';
          const errorMsg = typeof errorObj === 'object' ? JSON.stringify(errorObj, null, 2) : errorObj;
          logger.error(`HeyGen video generation failed. Full response: ${JSON.stringify(statusData, null, 2)}`);
          return res.status(500).json({
            error: `HeyGen video generation failed: ${errorMsg}`,
            details: statusData
          });
        }
      }

      attempts++;
    }

    if (!videoUrl) {
      logger.error("HeyGen video generation timed out");
      return res.status(500).json({
        error: "Video generation timed out after 5 minutes. Please try again."
      });
    }

    logger.info(`✓ HeyGen video generated: ${videoUrl}`);

    // Update ugc_videos table with avatar video URL
    const { error: updateError } = await supabaseAdmin
      .from('ugc_videos')
      .update({
        video_url: videoUrl,
        status: 'completed'
      })
      .eq('id', ugc_video_id);

    if (updateError) {
      logger.error(`Failed to update video URL: ${updateError.message}`);
    }

    logger.info(`✅ Avatar video generation complete`);

    return res.status(200).json({
      success: true,
      ugc_video_id,
      video_url: videoUrl
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Avatar video generation failed: ${error.message}`);
      logger.error(error.stack);
    }

    return res.status(500).json({
      error: "Failed to generate avatar video",
      details: error.message
    });
  }
}
