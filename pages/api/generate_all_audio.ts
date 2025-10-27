import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";
import * as Echogarden from "echogarden";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";

function ffprobeAsync(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, voice_id } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id is required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_all_audio");
    logger.log(`🎙️ Starting bulk audio generation for story: ${story_id}`);
    logger.log(`📥 Received voice_id from request: ${voice_id}`);

    const voiceId = voice_id || "21m00Tcm4TlvDq8ikWAM";
    logger.log(`🎤 Using voice_id: ${voiceId}`);

    // 1️⃣ Fetch all scenes for this story
    const { data: scenes, error: scenesErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, story_id, order")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (scenesErr) throw scenesErr;
    if (!scenes || scenes.length === 0) throw new Error("No scenes found for this story.");

    logger.log(`📚 Found ${scenes.length} scenes to generate audio for`);

    const updatedScenes = [];

    // 2️⃣ Generate audio for each scene
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      logger.log(`\n🎬 Processing scene ${i + 1}/${scenes.length} (ID: ${scene.id})`);
      logger.log(`📖 Scene text: "${scene.text.substring(0, 50)}..."`);

      try {
        // 3️⃣ Generate audio with ElevenLabs
        logger.log(`🧠 Generating TTS with ElevenLabs voice: ${voiceId}`);
        const ttsRes = await fetch(`${ELEVENLABS_API}/${voiceId}`, {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: scene.text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.4, similarity_boost: 0.7 },
          }),
        });

        if (!ttsRes.ok) {
          const errorText = await ttsRes.text();
          throw new Error(`ElevenLabs API error: ${errorText}`);
        }

        const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

        // 4️⃣ Save locally
        const tempDir = path.join(process.cwd(), "tmp", scene.id);
        fs.mkdirSync(tempDir, { recursive: true });
        const audioPath = path.join(tempDir, `scene-${scene.id}.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);

        // 5️⃣ Get duration
        const info = await ffprobeAsync(audioPath);
        const duration = info.format?.duration || 0;
        logger.log(`⏱ Audio duration: ${duration.toFixed(2)} seconds`);

        // 6️⃣ Generate word-level timestamps using forced alignment
        logger.log(`🔍 Generating word-level timestamps with forced alignment...`);
        let wordTimestamps = null;
        try {
          const alignmentResult = await Echogarden.align(audioPath, scene.text, {
            engine: 'dtw',
            language: 'en',
          });

          wordTimestamps = alignmentResult.wordTimeline.map((entry: any) => ({
            word: entry.text,
            start: entry.startTime,
            end: entry.endTime
          }));

          logger.log(`✅ Generated ${wordTimestamps.length} word timestamps`);
        } catch (alignErr: any) {
          logger.error(`⚠️ Word alignment failed for scene ${scene.id}, continuing without timestamps`, alignErr);
        }

        // 7️⃣ Delete old audio if exists
        const fileName = `scene-${scene.id}.mp3`;
        logger.log(`🗑️ Removing any existing audio file: ${fileName}`);
        await supabaseAdmin.storage.from("audio").remove([fileName]);

        // 8️⃣ Upload new audio to Supabase
        logger.log(`☁️ Uploading new audio file: ${fileName}`);
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("audio")
          .upload(fileName, fs.readFileSync(audioPath), {
            contentType: "audio/mpeg",
            upsert: false,
          });
        if (uploadErr) throw uploadErr;

        const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${fileName}`;

        // 9️⃣ Update scene with audio URL, voice_id, duration, word timestamps
        const { error: updateErr } = await supabaseAdmin
          .from("scenes")
          .update({
            audio_url: audioUrl,
            voice_id: voiceId,
            duration: duration,
            word_timestamps: wordTimestamps,
            audio_generated_at: new Date().toISOString()
          })
          .eq("id", scene.id);

        if (updateErr) throw updateErr;

        logger.log(`✅ Audio generated and saved for scene ${scene.id}`);

        updatedScenes.push({
          id: scene.id,
          order: scene.order,
          audio_url: audioUrl,
          duration: duration,
          voice_id: voiceId,
          word_timestamps: wordTimestamps
        });

      } catch (sceneErr: any) {
        logger.error(`❌ Failed to generate audio for scene ${scene.id}:`, sceneErr);
        // Continue with next scene instead of failing completely
        updatedScenes.push({
          id: scene.id,
          order: scene.order,
          error: sceneErr.message
        });
      }
    }

    logger.log(`\n✅ Bulk audio generation completed. ${updatedScenes.filter(s => !('error' in s)).length}/${scenes.length} scenes successful`);

    res.status(200).json({
      story_id,
      voice_id: voiceId,
      total_scenes: scenes.length,
      successful_scenes: updatedScenes.filter(s => !('error' in s)).length,
      updated_scenes: updatedScenes
    });
  } catch (err: any) {
    if (logger) logger.error("❌ Error during bulk audio generation", err);
    res.status(500).json({ error: err.message });
  }
}
