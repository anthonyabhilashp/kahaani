import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_video_canvas");
    logger.log(`🎬 Starting Canvas-based video generation for story: ${story_id}`);

    // 1️⃣ Fetch scenes in order
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, order, text")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found for this story");

    // 2️⃣ Fetch images for each scene
    const { data: images, error: imgErr } = await supabaseAdmin
      .from("images")
      .select("image_url, scene_order")
      .eq("story_id", story_id)
      .order("scene_order", { ascending: true });

    if (imgErr || !images?.length) throw new Error("No images found for this story");

    // 3️⃣ Fetch audio for each scene
    const { data: sceneAudio, error: audioErr } = await supabaseAdmin
      .from("audio")
      .select(`
        scene_id,
        audio_url,
        duration,
        scenes!inner(id, order)
      `)
      .eq("scenes.story_id", story_id)
      .not("scene_id", "is", null)
      .order("scenes.order", { ascending: true });

    // 4️⃣ Build scene data with timing
    const sceneData = scenes.map((scene, index) => {
      const image = images.find(img => img.scene_order === index);
      const audio = sceneAudio?.find(a => a.scene_id === scene.id);
      
      return {
        sceneIndex: index,
        sceneId: scene.id,
        text: scene.text,
        imageUrl: image?.image_url,
        audioUrl: audio?.audio_url,
        duration: audio?.duration || 4 // Default 4 seconds if no audio
      };
    });

    logger.log(`🎯 Prepared ${sceneData.length} scenes for video generation`);

    // 5️⃣ Calculate total video duration
    const totalDuration = sceneData.reduce((sum, scene) => sum + scene.duration, 0);
    
    logger.log(`🎬 Total video duration: ${totalDuration}s`);

    // 6️⃣ Return data for client-side video generation
    res.status(200).json({ 
      story_id, 
      scenes: sceneData,
      totalDuration,
      videoConfig: {
        width: 1080,
        height: 1920,
        fps: 30,
        transitionDuration: 0.5 // 500ms crossfade between scenes
      }
    });

  } catch (err: any) {
    if (logger) logger.error("❌ Error preparing video data", err);
    res.status(500).json({ error: err.message });
  }
}