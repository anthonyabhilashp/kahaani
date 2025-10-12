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
  const { story_id, audio_id: providedAudioId } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_video");
    logger.log(`🎬 Starting video generation for story: ${story_id}`);

    const tmpDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1️⃣ Get the correct audio file
    let audioRecord;

    if (providedAudioId) {
      logger.log(`🔍 Using provided audio_id: ${providedAudioId}`);
      const { data, error } = await supabaseAdmin
        .from("audio")
        .select("id, story_id, audio_url, voice_id, created_at")
        .eq("id", providedAudioId)
        .single();
      if (error || !data) throw new Error("Invalid audio_id provided");
      audioRecord = data;
    } else {
      logger.log("🔍 No audio_id provided — using latest audio for story");
      const { data, error } = await supabaseAdmin
        .from("audio")
        .select("id, story_id, audio_url, voice_id, created_at")
        .eq("story_id", story_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error || !data) throw new Error("No audio found for this story");
      audioRecord = data;
    }

    const { id: audio_id, audio_url: audioUrl, voice_id } = audioRecord;
    logger.log(`🎧 Using audio file: ${audio_id} (${voice_id || "unknown voice"})`);

    // Download audio locally
    const audioRes = await fetch(audioUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const audioPath = path.join(tmpDir, `audio-${audio_id}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    // 2️⃣ Fetch all images for story
    const { data: images, error: imgErr } = await supabaseAdmin
      .from("images")
      .select("image_url, scene_order")
      .eq("story_id", story_id)
      .order("scene_order", { ascending: true });

    if (imgErr || !images?.length) throw new Error("No images found for this story");

    const imagePaths: string[] = [];
    for (const img of images) {
      const imgRes = await fetch(img.image_url);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const imgPath = path.join(tmpDir, `scene-${img.scene_order}.png`);
      fs.writeFileSync(imgPath, buf);
      imagePaths.push(imgPath);
    }
    logger.log(`🖼️ Downloaded ${imagePaths.length} scene images`);

    // 3️⃣ Clean up old video for same audio_id
    const { data: oldVideos } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .eq("audio_id", audio_id);

    if (oldVideos?.length) {
      logger.log(`🧹 Cleaning up ${oldVideos.length} old video(s)...`);
      const paths = oldVideos.map((v) => v.video_url.split("/videos/")[1]);
      if (paths.length) {
        const { error: delErr } = await supabaseAdmin.storage.from("videos").remove(paths);
        if (delErr) logger.error("⚠️ Error deleting old videos", delErr);
      }
      await supabaseAdmin.from("videos").delete().eq("audio_id", audio_id);
    }

    // 4️⃣ Compute duration safely
    const audioDuration = await getAudioDuration(audioPath);
    const durationPerImage = Math.max(3, audioDuration / imagePaths.length);
    logger.log(`⏱ Audio duration: ${audioDuration}s (${durationPerImage.toFixed(2)}s per image)`);

    // 5️⃣ Get shared dimensions from .env
    const width = parseInt(process.env.VIDEO_WIDTH || "1080");
    const height = parseInt(process.env.VIDEO_HEIGHT || "1920");
    const aspect = process.env.ASPECT_RATIO || "9:16";
    logger.log(`🎞️ Rendering video at ${width}x${height} (${aspect})`);

    // 6️⃣ Generate clips
    const concatList: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const img = imagePaths[i];
      const clipPath = path.join(tmpDir, `clip${i + 1}.mp4`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(img)
          .loop(durationPerImage)
          .videoCodec("libx264")
          .noAudio()
          .outputOptions([
            "-pix_fmt yuv420p",
            `-vf scale=${width}:${height},zoompan=z='min(zoom+0.001,1.1)':s=${width}x${height},format=yuv420p`,
            `-t ${durationPerImage}`,
          ])
          .save(clipPath)
          .on("end", resolve)
          .on("error", reject);
      });

      concatList.push(`file '${clipPath}'`);
    }

    // 7️⃣ Merge clips + audio
    const concatTxt = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(concatTxt, concatList.join("\n"));
    const finalVideo = path.join(tmpDir, `video-${audio_id}.mp4`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatTxt)
        .inputOptions(["-f concat", "-safe 0"])
        .input(audioPath)
        .outputOptions([
          "-c:v libx264",
          "-c:a aac",
          "-shortest",
          "-pix_fmt yuv420p",
          "-movflags +faststart",
        ])
        .save(finalVideo)
        .on("start", (cmd) => logger.log(`🚀 FFmpeg started: ${cmd}`))
        .on("end", () => {
          logger.log("✅ Final video generated successfully");
          resolve();
        })
        .on("error", (err) => {
          logger.error("❌ FFmpeg failed", err);
          reject(err);
        });
    });

    // 8️⃣ Upload final video
    const buffer = fs.readFileSync(finalVideo);
    const fileName = `video-${audio_id}.mp4`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("videos")
      .upload(fileName, buffer, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;
    await supabaseAdmin.from("videos").insert([{ story_id, audio_id, voice_id, video_url: publicUrl }]);

    logger.log(`☁️ Uploaded final video → ${publicUrl}`);
    res.status(200).json({ story_id, audio_id, video_url: publicUrl });
  } catch (err: any) {
    if (logger) logger.error("❌ Error generating video", err);
    res.status(500).json({ error: err.message });
  }
}
