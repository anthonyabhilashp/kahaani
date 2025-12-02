import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getUserLogger } from "../../lib/userLogger";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";
import * as Echogarden from "echogarden";
import { getUserCredits, deductCredits, refundCredits, CREDIT_COSTS } from "../../lib/credits";

const OPENAI_TTS_API = "https://api.openai.com/v1/audio/speech";

// OpenAI voice mapping - supports both OpenAI voice names and old ElevenLabs IDs
// Valid OpenAI voices: alloy, echo, fable, onyx, nova, shimmer, ash, coral, sage
const VOICE_MAPPING: { [key: string]: string } = {
  // OpenAI voice IDs (direct pass-through)
  "alloy": "alloy",
  "echo": "echo",
  "fable": "fable",
  "onyx": "onyx",
  "nova": "nova",
  "shimmer": "shimmer",
  "ash": "ash",
  "coral": "coral",
  "sage": "sage",
  // Legacy ElevenLabs IDs (for backward compatibility)
  "21m00Tcm4TlvDq8ikWAM": "alloy",  // Rachel → alloy
  "EXAVITQu4vr4xnSDxMaL": "nova",   // Bella → nova
  "ErXwobaYiN019PkySvjV": "shimmer", // Antoni → shimmer
  "MF3mGyEYCl7XYWbV9V6O": "fable",  // Elli → fable
  "TxGEqnHWrfWFTfGW9XjX": "echo",   // Josh → echo
  "VR6AewLTigWG4xSOukaG": "onyx",   // Arnold → onyx
  "pNInz6obpgDQGcFmaJgB": "fable",  // Adam → fable
  "yoZ06aMxZJJ28mfd3POQ": "nova",   // Sam → nova
  "default": "alloy"
};

function ffprobeAsync(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, voice_id } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id is required" });

  let logger: any = null;
  let userId: string | null = null;

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

    userId = user.id;
    logger = getUserLogger(userId);

    if (logger) { logger.info(`[${story_id}] 🎙️ Starting bulk audio generation for story: ${story_id}`); }
    if (logger) { logger.info(`[${story_id}] 📥 Received voice_id from request: ${voice_id}`); }
    if (logger) { logger.info(`[${story_id}] 👤 User: ${user.email} (${user.id})`); }

    const voiceId = voice_id || "alloy";
    if (logger) { logger.info(`[${story_id}] 🎤 Using voice_id: ${voiceId}`); }

    // Map to OpenAI voice (supports legacy ElevenLabs IDs)
    const openaiVoice = VOICE_MAPPING[voiceId] || VOICE_MAPPING["default"];
    if (logger) { logger.info(`[${story_id}] 🎤 Mapped to OpenAI voice: ${openaiVoice}`); }

    // 1️⃣ Fetch all scenes for this story
    const { data: scenes, error: scenesErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, story_id, order")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (scenesErr) throw scenesErr;
    if (!scenes || scenes.length === 0) throw new Error("No scenes found for this story.");

    if (logger) { logger.info(`[${story_id}] 📚 Found ${scenes.length} scenes to generate audio for`); }

    // 💰 Check credits (will deduct AFTER successful generation)
    const creditsNeeded = scenes.length * CREDIT_COSTS.AUDIO_PER_SCENE;
    if (logger) { logger.info(`[${story_id}] 💰 Credits needed: ${creditsNeeded} (${scenes.length} scenes × ${CREDIT_COSTS.AUDIO_PER_SCENE} - will charge after success)`); }

    const currentBalance = await getUserCredits(userId);
    if (logger) { logger.info(`[${story_id}] 💳 Current balance: ${currentBalance} credits`); }

    if (currentBalance < creditsNeeded) {
      if (logger) { logger.error(`[${story_id}] ❌ Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`); }
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credits but have ${currentBalance}.`,
        creditsNeeded,
        currentBalance
      });
    }

    const updatedScenes = [];

    // 2️⃣ Generate audio for each scene
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (logger) { logger.info(`[${story_id}] \n🎬 Processing scene ${i + 1}/${scenes.length} (ID: ${scene.id})`); }
      if (logger) { logger.info(`[${story_id}] 📖 Scene text: "${scene.text.substring(0, 50)}..."`); }

      try {
        // 3️⃣ Generate audio with OpenAI TTS
        const audioModel = process.env.AUDIO_MODEL || "tts-1-hd";
        if (logger) { logger.info(`[${story_id}] 🧠 Generating TTS with OpenAI voice: ${openaiVoice} (model: ${audioModel})`); }
        const ttsRes = await fetch(OPENAI_TTS_API, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: audioModel,
            input: scene.text,
            voice: openaiVoice,
            response_format: "mp3",
            speed: 1.0
          }),
        });

        if (!ttsRes.ok) {
          const errorText = await ttsRes.text();
          throw new Error(`OpenAI TTS API error: ${errorText}`);
        }

        const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

        // 5️⃣ Save locally
        const tempDir = path.join(process.cwd(), "tmp", scene.id);
        fs.mkdirSync(tempDir, { recursive: true });
        const audioPath = path.join(tempDir, `scene-${scene.id}.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);

        // 6️⃣ Get duration
        const info = await ffprobeAsync(audioPath);
        const duration = info.format?.duration || 0;
        if (logger) { logger.info(`[${story_id}] ⏱ Audio duration: ${duration.toFixed(2)} seconds`); }

        // 7️⃣ Generate word-level timestamps using forced alignment
        if (logger) { logger.info(`[${story_id}] 🔍 Generating word-level timestamps with forced alignment...`); }
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

          if (logger) { logger.info(`[${story_id}] ✅ Generated ${wordTimestamps.length} word timestamps`); }
        } catch (alignErr: any) {
          if (logger) { logger.error(`[${story_id}] ⚠️ Word alignment failed for scene ${scene.id}, continuing without timestamps: ${alignErr instanceof Error ? alignErr.message : String(alignErr)}`); }
        }

        // 8️⃣ Delete old audio files for this scene (all versions)
        const oldFilePattern = `scene-${scene.id}`;
        if (logger) { logger.info(`[${story_id}] 🗑️ Removing any existing audio files for scene: ${oldFilePattern}*`); }

        // List and delete all files matching this scene
        const { data: existingFiles } = await supabaseAdmin.storage
          .from("audio")
          .list();

        if (existingFiles) {
          const filesToDelete = existingFiles
            .filter(file => file.name.startsWith(oldFilePattern))
            .map(file => file.name);

          if (filesToDelete.length > 0) {
            await supabaseAdmin.storage.from("audio").remove(filesToDelete);
            if (logger) { logger.info(`[${story_id}] 🗑️ Deleted ${filesToDelete.length} old file(s)`); }
          }
        }

        // 9️⃣ Upload new audio to Supabase with timestamp to prevent caching
        const timestamp = Date.now();
        const fileName = `scene-${scene.id}-${timestamp}.mp3`;
        if (logger) { logger.info(`[${story_id}] ☁️ Uploading new audio file: ${fileName}`); }
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("audio")
          .upload(fileName, fs.readFileSync(audioPath), {
            contentType: "audio/mpeg",
            upsert: false,
            cacheControl: 'no-cache, no-store, must-revalidate' // Prevent browser caching
          });
        if (uploadErr) throw uploadErr;

        const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${fileName}`;

        // 🔟 Update scene with audio URL, voice_id, duration, word timestamps
        const { error: updateErr } = await supabaseAdmin
          .from("scenes")
          .update({
            audio_url: audioUrl,
            voice_id: openaiVoice,
            duration: duration,
            word_timestamps: wordTimestamps,
            audio_generated_at: new Date().toISOString()
          })
          .eq("id", scene.id);

        if (updateErr) throw updateErr;

        if (logger) { logger.info(`[${story_id}] ✅ Audio generated and saved for scene ${scene.id}`); }

        updatedScenes.push({
          id: scene.id,
          order: scene.order,
          audio_url: audioUrl,
          duration: duration,
          voice_id: openaiVoice,
          word_timestamps: wordTimestamps
        });

      } catch (sceneErr: any) {
        if (logger) { logger.error(`[${story_id}] ❌ Failed to generate audio for scene ${scene.id}: ${sceneErr instanceof Error ? sceneErr.message : String(sceneErr)}`); }
        // Continue with next scene instead of failing completely
        updatedScenes.push({
          id: scene.id,
          order: scene.order,
          error: sceneErr.message
        });
      }
    }

    if (logger) { logger.info(`[${story_id}] \n✅ Bulk audio generation completed. ${updatedScenes.filter(s => !('error' in s)).length}/${scenes.length} scenes successful`); }

    // 💳 Deduct credits ONLY for successful scenes
    const successfulCount = updatedScenes.filter(s => !('error' in s)).length;
    if (successfulCount > 0 && userId) {
      const chargeAmount = successfulCount * CREDIT_COSTS.AUDIO_PER_SCENE;
      if (logger) { logger.info(`[${story_id}] 💳 Deducting ${chargeAmount} credits for ${successfulCount} successful scenes...`); }

      const deductResult = await deductCredits(
        userId,
        chargeAmount,
        'deduction_audio',
        `Bulk audio generation for ${successfulCount} successful scenes`,
        story_id
      );

      if (deductResult.success) {
        if (logger) { logger.info(`[${story_id}] ✅ Deducted ${chargeAmount} credits. New balance: ${deductResult.newBalance}`); }
      } else {
        if (logger) { logger.error(`[${story_id}] ⚠️ Failed to deduct credits: ${deductResult.error}`); }
        // Audio was generated successfully, so we don't fail the request
        // Admin can manually adjust credits if needed
      }
    }

    // Update story metadata (duration and completion status)
    if (logger) { logger.info(`[${story_id}] 📊 Updating story metadata...`); }
    await updateStoryMetadata(story_id);
    if (logger) { logger.info(`[${story_id}] ✅ Story metadata updated`); }

    res.status(200).json({
      story_id,
      voice_id: openaiVoice,
      total_scenes: scenes.length,
      successful_scenes: updatedScenes.filter(s => !('error' in s)).length,
      updated_scenes: updatedScenes
    });
  } catch (err: any) {
    if (logger) {
      if (logger) { logger.error(`❌ Error during bulk audio generation: ${err instanceof Error ? err.message : String(err)}`); }
    } else {
      console.error(`❌ Error during bulk audio generation: ${err instanceof Error ? err.message : String(err)}`);
    }
    // No refund needed since credits are only deducted after success
    res.status(500).json({ error: err.message });
  }
}
