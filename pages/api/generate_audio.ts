import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";

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
    logger = new JobLogger(story_id, "generate_audio");
    logger.log(`🎙️ Starting audio generation for story: ${story_id}`);

    const voiceId = voice_id || "21m00Tcm4TlvDq8ikWAM";

    // 1️⃣ Fetch scenes
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("text")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr) throw sceneErr;
    if (!scenes || scenes.length === 0)
      throw new Error("No scenes found for this story.");

    // 2️⃣ Combine text
    const fullStoryText = scenes.map((s) => s.text).join(" ");
    logger.log(`📖 Combined story length: ${fullStoryText.length} chars`);

    // 3️⃣ Generate audio
    logger.log(`🧠 Generating TTS with ElevenLabs voice: ${voiceId}`);
    const ttsRes = await fetch(`${ELEVENLABS_API}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: fullStoryText,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.4, similarity_boost: 0.7 },
      }),
    });

    if (!ttsRes.ok) throw new Error(await ttsRes.text());

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // 4️⃣ Save locally
    const tempDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tempDir, { recursive: true });
    const audioPath = path.join(tempDir, `story-${story_id}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    // 5️⃣ Get duration
    const info = await ffprobeAsync(audioPath);
    const duration = info.format?.duration || 0;
    logger.log(`⏱ Audio duration: ${duration.toFixed(2)} seconds`);

    // 6️⃣ Upload to Supabase
    const fileName = `story-${story_id}.mp3`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("audio")
      .upload(fileName, fs.readFileSync(audioPath), {
        contentType: "audio/mpeg",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${fileName}`;

    // 7️⃣ Save metadata
    const { error: insertErr } = await supabaseAdmin.from("audio")
                                .upsert(
                                    { story_id, voice_id: voiceId, audio_url: audioUrl, duration },
                                    { onConflict: "story_id, voice_id" }
                                );

    if (insertErr) throw insertErr;

    logger.log(`✅ Audio saved to Supabase: ${audioUrl}`);

    res.status(200).json({ story_id, voice_id: voiceId, audio_url: audioUrl, duration });
  } catch (err: any) {
    if (logger) logger.error("❌ Error during audio generation", err);
    res.status(500).json({ error: err.message });
  }
}
