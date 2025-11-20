import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getUserLogger } from "../../lib/userLogger";
import { getUserCredits, deductCredits, CREDIT_COSTS } from "../../lib/credits";
import * as fal from "@fal-ai/serverless-client";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: { sizeLimit: "4mb" },
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes timeout for video generation
};

// Configure fal.ai
fal.config({
  credentials: process.env.FAL_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { scene_id, story_id } = req.body;

  if (!scene_id) {
    return res.status(400).json({ error: "scene_id is required" });
  }

  const logger = getUserLogger(story_id || 'video_from_image');

  try {
    // 1. Authenticate user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    logger.info(`[Scene ${scene_id}] Starting video generation for user ${user.id}`);

    // 2. Get scene data (including duration for proper video length)
    const { data: scene, error: sceneError } = await supabaseAdmin
      .from("scenes")
      .select("id, story_id, text, image_url, order, duration")
      .eq("id", scene_id)
      .single();

    if (sceneError || !scene) {
      return res.status(404).json({ error: "Scene not found" });
    }

    if (!scene.image_url) {
      return res.status(400).json({ error: "Scene must have an image first. Generate an image before creating video." });
    }

    // 3. Check user credits
    const creditsNeeded = CREDIT_COSTS.VIDEO_FROM_IMAGE;
    const currentBalance = await getUserCredits(user.id);

    logger.info(`[Scene ${scene_id}] Credits needed: ${creditsNeeded}, Current balance: ${currentBalance}`);

    if (currentBalance < creditsNeeded) {
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credits for video generation, but you only have ${currentBalance}.`,
        required_credits: creditsNeeded,
        current_balance: currentBalance
      });
    }

    // 4. Get story info for logging
    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("title, aspect_ratio, default_image_style")
      .eq("id", scene.story_id)
      .single();

    const aspectRatio = story?.aspect_ratio || "9:16";
    const imageStyle = story?.default_image_style || "cinematic illustration";

    // 5. Create motion prompt from scene text
    // Use the exact image style for consistency
    const motionPrompt = `${imageStyle}. ${scene.text.substring(0, 200)}`;

    // Determine Kling duration based on scene audio duration
    // Kling supports "5" or "10" seconds
    const sceneDuration = scene.duration || 10;
    const klingDuration = sceneDuration <= 5 ? "5" : "10";

    logger.info(`[Scene ${scene_id}] Calling Kling API with duration: ${klingDuration}s (scene audio: ${sceneDuration.toFixed(2)}s)`);
    logger.info(`[Scene ${scene_id}] Prompt: ${motionPrompt.substring(0, 100)}...`);

    // 6. Call Kling via fal.ai (using v1.6 standard for faster generation)
    const result = await fal.subscribe("fal-ai/kling-video/v1.6/standard/image-to-video", {
      input: {
        prompt: motionPrompt,
        image_url: scene.image_url.split('?')[0], // Remove cache busting params
        duration: klingDuration,
        aspect_ratio: aspectRatio,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          logger.info(`[Scene ${scene_id}] Kling generation in progress...`);
        }
      },
    }) as any;

    if (!result?.video?.url) {
      logger.error(`[Scene ${scene_id}] Kling API returned no video URL`);
      throw new Error("Video generation failed - no video returned");
    }

    const generatedVideoUrl = result.video.url;
    logger.info(`[Scene ${scene_id}] Video generated: ${generatedVideoUrl}`);

    // 7. Download and upload to Supabase Storage
    logger.info(`[Scene ${scene_id}] Downloading video for storage...`);
    const videoResponse = await fetch(generatedVideoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download generated video: ${videoResponse.statusText}`);
    }

    const videoBuffer = await videoResponse.buffer();
    const fileName = `${user.id}/generated_videos/${scene_id}_${Date.now()}.mp4`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("videos")
      .upload(fileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: true
      });

    if (uploadError) {
      logger.error(`[Scene ${scene_id}] Upload error: ${uploadError.message}`);
      throw new Error(`Failed to upload video: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("videos")
      .getPublicUrl(fileName);

    logger.info(`[Scene ${scene_id}] Video uploaded to: ${publicUrl}`);

    // 8. Update scene with video URL (replaces image)
    const { error: updateError } = await supabaseAdmin
      .from("scenes")
      .update({
        video_url: publicUrl
      })
      .eq("id", scene_id);

    if (updateError) {
      logger.error(`[Scene ${scene_id}] Failed to update scene: ${updateError.message}`);
      throw new Error(`Failed to update scene: ${updateError.message}`);
    }

    // 9. Deduct credits
    const deductResult = await deductCredits(
      user.id,
      creditsNeeded,
      'deduction_video_from_image',
      `AI video generation for scene ${scene.order + 1} in story: ${story?.title || scene.story_id}`,
      scene.story_id
    );

    if (!deductResult.success) {
      logger.warn(`[Scene ${scene_id}] Failed to deduct credits: ${deductResult.error}`);
      // Don't fail the request, video was already generated
    }

    logger.info(`[Scene ${scene_id}] Video generation complete, deducted ${creditsNeeded} credits`);

    // 10. Track analytics
    await supabaseAdmin.from("analytics_events").insert({
      user_id: user.id,
      event_name: 'video_from_image_generated',
      event_data: {
        story_id: scene.story_id,
        scene_id: scene_id,
        aspect_ratio: aspectRatio,
        credits_used: creditsNeeded
      }
    });

    return res.status(200).json({
      success: true,
      video_url: publicUrl,
      credits_used: creditsNeeded,
      new_balance: deductResult.newBalance
    });

  } catch (err: any) {
    logger.error(`[Scene ${scene_id}] Error: ${err.message}`);

    return res.status(500).json({
      error: err.message || "Failed to generate video from image"
    });
  }
}
