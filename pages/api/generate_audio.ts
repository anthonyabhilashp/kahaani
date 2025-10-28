import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";
import * as Echogarden from "echogarden";
import { textToSSML } from "../../lib/ssmlHelper";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";

function ffprobeAsync(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { scene_id, voice_id } = req.body;
  if (!scene_id) return res.status(400).json({ error: "scene_id is required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(scene_id, "generate_audio");
    logger.log(`🎙️ Starting audio generation for scene: ${scene_id}`);

    const voiceId = voice_id || "21m00Tcm4TlvDq8ikWAM";

    // 1️⃣ Fetch scene data
    const { data: scene, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, story_id, order")
      .eq("id", scene_id)
      .single();

    if (sceneErr) throw sceneErr;
    if (!scene) throw new Error("Scene not found.");

    const sceneText = scene.text;
    logger.log(`📖 Scene text length: ${sceneText.length} chars`);

    // Use fixed defaults for voice parameters (same for all stories)
    const voiceStability = 0.4;
    const voiceSimilarity = 0.7;
    logger.log(`🎤 Voice settings: stability=${voiceStability}, similarity=${voiceSimilarity}`);

    // 2️⃣ Convert text to SSML with intelligent pauses
    const ssmlText = textToSSML(sceneText, {
      sentencePause: 500, // 0.5s after sentences
      endPause: 800, // 0.8s at scene end
      commaPause: 300, // 0.3s after commas
    });
    logger.log(`📝 Using SSML for better narration flow`);
    logger.log(`🔍 SSML preview: ${ssmlText.substring(0, 100)}...`);

    // 3️⃣ Generate audio
    logger.log(`🧠 Generating TTS with ElevenLabs voice: ${voiceId}`);
    const ttsRes = await fetch(`${ELEVENLABS_API}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: ssmlText,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: voiceStability,
          similarity_boost: voiceSimilarity
        },
        enable_ssml: true,
      }),
    });

    if (!ttsRes.ok) throw new Error(await ttsRes.text());

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // 4️⃣ Save locally
    const tempDir = path.join(process.cwd(), "tmp", scene_id);
    fs.mkdirSync(tempDir, { recursive: true });
    const audioPath = path.join(tempDir, `scene-${scene_id}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    // 5️⃣ Get duration
    const info = await ffprobeAsync(audioPath);
    const duration = info.format?.duration || 0;
    logger.log(`⏱ Audio duration: ${duration.toFixed(2)} seconds`);

    // 6️⃣ Generate word-level timestamps using forced alignment
    logger.log(`🔍 Generating word-level timestamps with forced alignment...`);
    let wordTimestamps = null;
    try {
      const alignmentResult = await Echogarden.align(audioPath, sceneText, {
        engine: 'dtw',
        language: 'en',
      });

      // Extract word timestamps from timeline
      wordTimestamps = alignmentResult.wordTimeline.map((entry: any) => ({
        word: entry.text,
        start: entry.startTime,
        end: entry.endTime
      }));

      logger.log(`✅ Generated ${wordTimestamps.length} word timestamps`);
    } catch (alignErr: any) {
      logger.error(`⚠️ Word alignment failed, continuing without timestamps`, alignErr);
      // Continue without timestamps rather than failing completely
    }

    // 7️⃣ Delete old audio if exists and upload new one
    const fileName = `scene-${scene_id}.mp3`;

    // Always delete first to avoid "resource already exists" error
    logger.log(`🗑️ Removing any existing audio file: ${fileName}`);
    await supabaseAdmin.storage.from("audio").remove([fileName]);
    logger.log(`✅ Cleanup completed`);

    // 8️⃣ Upload new audio to Supabase
    logger.log(`☁️ Uploading new audio file: ${fileName}`);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("audio")
      .upload(fileName, fs.readFileSync(audioPath), {
        contentType: "audio/mpeg",
        upsert: false,
      });
    if (uploadErr) throw uploadErr;
    logger.log(`✅ Audio uploaded successfully`);

    const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${fileName}`;

    // 9️⃣ Update scene with audio URL, voice_id, duration, word timestamps, and set audio_generated_at timestamp
    const { error: updateErr } = await supabaseAdmin
      .from("scenes")
      .update({
        audio_url: audioUrl,
        voice_id: voiceId,
        duration: duration,
        word_timestamps: wordTimestamps,
        audio_generated_at: new Date().toISOString()
      })
      .eq("id", scene_id);

    if (updateErr) throw updateErr;

    // 9️⃣ Update story metadata (duration and completion status)
    logger.log(`📊 Updating story metadata...`);
    await updateStoryMetadata(scene.story_id);
    logger.log(`✅ Story metadata updated`);

    logger.log(`✅ Audio saved to Supabase for scene: ${audioUrl}`);
    res.status(200).json({
      scene_id,
      story_id: scene.story_id,
      voice_id: voiceId,
      audio_url: audioUrl,
      duration,
      word_timestamps: wordTimestamps
    });
  } catch (err: any) {
    if (logger) logger.error("❌ Error during audio generation", err);
    res.status(500).json({ error: err.message });
  }
}
