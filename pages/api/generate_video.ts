import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { JobLogger } from "../../lib/logger";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// --- Safe ffprobe helper ---
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        console.warn("⚠️ ffprobe failed, using default 30s duration", err);
        return resolve(30);
      }
      const duration = data?.format?.duration || 0;
      resolve(duration > 1 ? duration : 30); // fallback to 30s if weird
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_video");
    logger.log(`🎬 Starting video generation for story: ${story_id}`);

    const tmpDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1️⃣ Fetch scenes in order
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, order, text")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found for this story");
    logger.log(`� Found ${scenes.length} scenes`);

    // 2️⃣ Fetch images for each scene
    const { data: images, error: imgErr } = await supabaseAdmin
      .from("images")
      .select("image_url, scene_order")
      .eq("story_id", story_id)
      .order("scene_order", { ascending: true });

    if (imgErr || !images?.length) throw new Error("No images found for this story");

    // 3️⃣ Fetch audio for each scene with JOIN
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

    if (audioErr) {
      logger.log("⚠️ No scene audio found, will use default timing");
    }

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
        duration: audio?.duration || 3 // Default 3 seconds if no audio
      };
    });

    logger.log(`� Scene timing: ${sceneData.map(s => `Scene ${s.sceneIndex + 1}: ${s.duration}s`).join(', ')}`);

    // 5️⃣ Download all media files
    const mediaPaths: Array<{
      sceneIndex: number;
      duration: number;
      imagePath?: string;
      audioPath?: string;
    }> = [];
    
    for (const scene of sceneData) {
      const sceneFiles: any = { sceneIndex: scene.sceneIndex, duration: scene.duration };
      
      // Download image
      if (scene.imageUrl) {
        const imgRes = await fetch(scene.imageUrl);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const imgPath = path.join(tmpDir, `scene-${scene.sceneIndex}.png`);
        fs.writeFileSync(imgPath, buf);
        sceneFiles.imagePath = imgPath;
      }
      
      // Download audio if exists
      if (scene.audioUrl) {
        const audioRes = await fetch(scene.audioUrl);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        const audioPath = path.join(tmpDir, `scene-${scene.sceneIndex}-audio.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);
        sceneFiles.audioPath = audioPath;
      }
      
      mediaPaths.push(sceneFiles);
    }

    logger.log(`🖼️ Downloaded media for ${mediaPaths.length} scenes`);

    // 6️⃣ Clean up old videos for this story
    const { data: oldVideos } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .eq("story_id", story_id);

    if (oldVideos?.length) {
      logger.log(`🧹 Cleaning up ${oldVideos.length} old video(s)...`);
      const paths = oldVideos.map((v) => v.video_url.split("/videos/")[1]);
      if (paths.length) {
        const { error: delErr } = await supabaseAdmin.storage.from("videos").remove(paths);
        if (delErr) logger.error("⚠️ Error deleting old videos", delErr);
      }
      await supabaseAdmin.from("videos").delete().eq("story_id", story_id);
    }

    // 7️⃣ Get video dimensions from .env
    const width = parseInt(process.env.VIDEO_WIDTH || "1080");
    const height = parseInt(process.env.VIDEO_HEIGHT || "1920");
    const aspect = process.env.ASPECT_RATIO || "9:16";
    logger.log(`🎞️ Rendering video at ${width}x${height} (${aspect})`);

    // 8️⃣ Generate individual scene clips with precise timing
    const videoClips: string[] = [];
    const audioClips: string[] = [];
    
    for (const scene of mediaPaths) {
      if (!scene.imagePath) continue; // Skip scenes without images
      
      const clipPath = path.join(tmpDir, `clip-${scene.sceneIndex}.mp4`);
      
      // Create video clip for this scene duration
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(scene.imagePath!)
          .loop(scene.duration)
          .videoCodec("libx264")
          .noAudio()
          .outputOptions([
            "-pix_fmt yuv420p",
            `-vf scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='min(zoom+0.0015,1.1)':s=${width}x${height}`,
            `-t ${scene.duration}`,
          ])
          .save(clipPath)
          .on("end", resolve)
          .on("error", reject);
      });
      
      videoClips.push(`file '${clipPath}'`);
      
      // If scene has audio, add it to audio clips list
      if (scene.audioPath) {
        audioClips.push(scene.audioPath);
      }
    }

    // 9️⃣ Combine all video clips
    const concatTxt = path.join(tmpDir, "video-concat.txt");
    fs.writeFileSync(concatTxt, videoClips.join("\n"));
    
    const videoOnlyPath = path.join(tmpDir, `video-only-${story_id}.mp4`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatTxt)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions([
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-movflags +faststart",
        ])
        .save(videoOnlyPath)
        .on("end", resolve)
        .on("error", reject);
    });

    // 🔟 Create final video with smooth transitions and proper audio sync
    const finalVideo = path.join(tmpDir, `final-video-${story_id}.mp4`);
    
    // Build FFmpeg command with all inputs
    const ffmpegCommand = ffmpeg();
    
    // Add video input
    ffmpegCommand.input(videoOnlyPath);
    
    // Add all audio inputs if they exist
    const audioInputs: string[] = [];
    for (const scene of mediaPaths) {
      if (scene.audioPath) {
        ffmpegCommand.input(scene.audioPath);
        audioInputs.push(scene.audioPath);
      }
    }
    
    if (audioInputs.length > 0) {
      // Complex filter for audio mixing and smooth video transitions
      let filterComplex = '';
      
      // Create audio mix filter
      if (audioInputs.length === 1) {
        filterComplex = `[0:v]fade=in:0:15,fade=out:st=${mediaPaths.reduce((sum, scene) => sum + scene.duration, 0) - 0.5}:d=15[v];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a]`;
      } else {
        // Mix multiple audio streams
        const audioMixInputs = audioInputs.map((_, i) => `[${i + 1}:a]`).join('');
        filterComplex = `[0:v]fade=in:0:15,fade=out:st=${mediaPaths.reduce((sum, scene) => sum + scene.duration, 0) - 0.5}:d=15[v];${audioMixInputs}amix=inputs=${audioInputs.length}:duration=first:dropout_transition=3[a]`;
      }
      
      await new Promise<void>((resolve, reject) => {
        ffmpegCommand
          .complexFilter(filterComplex)
          .outputOptions([
            "-map [v]",
            "-map [a]",
            "-c:v libx264",
            "-c:a aac",
            "-preset fast",
            "-crf 23",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-shortest"
          ])
          .save(finalVideo)
          .on("start", (cmd: any) => logger?.log(`🚀 FFmpeg started: ${cmd}`))
          .on("end", () => {
            logger?.log("✅ Final video with synced audio generated successfully");
            resolve();
          })
          .on("error", (err: any) => {
            logger?.error("❌ FFmpeg failed", err);
            reject(err);
          });
      });
    } else {
      // No audio, add smooth transitions to video only
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoOnlyPath)
          .outputOptions([
            "-vf fade=in:0:15,fade=out:st=" + (mediaPaths.reduce((sum, scene) => sum + scene.duration, 0) - 0.5) + ":d=15",
            "-c:v libx264",
            "-preset fast",
            "-crf 23",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
          ])
          .save(finalVideo)
          .on("start", (cmd: any) => logger?.log(`🚀 FFmpeg started: ${cmd}`))
          .on("end", () => {
            logger?.log("✅ Video-only with transitions generated successfully");
            resolve();
          })
          .on("error", (err: any) => {
            logger?.error("❌ FFmpeg failed", err);
            reject(err);
          });
      });
    }

    // 11️⃣ Upload final video
    const buffer = fs.readFileSync(finalVideo);
    const fileName = `video-${story_id}-${Date.now()}.mp4`;

    const { error: uploadErr } = await supabaseAdmin.storage
    .from("videos")
    .upload(fileName, buffer, {
        contentType: "video/mp4",
        upsert: true,
    });

    if (uploadErr) throw uploadErr;

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;

    // 12️⃣ Save video metadata
    const { error: upsertErr } = await supabaseAdmin
    .from("videos")
    .upsert(
        {
        story_id,
        video_url: publicUrl,
        created_at: new Date().toISOString(),
        },
        { onConflict: "story_id" } // ensures one video per story
    );

    if (upsertErr) throw upsertErr;

    const totalDuration = mediaPaths.reduce((sum, scene) => sum + scene.duration, 0);
    logger.log(`☁️ Uploaded video → ${publicUrl} (${totalDuration.toFixed(1)}s total)`);
    res.status(200).json({ story_id, video_url: publicUrl, duration: totalDuration });
  } catch (err: any) {
    if (logger) logger.error("❌ Error generating video", err);
    res.status(500).json({ error: err.message });
  }
}
