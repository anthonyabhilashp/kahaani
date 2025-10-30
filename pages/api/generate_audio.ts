import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";
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
  "MF3mGyEYCl7XYWbV9V6O": "echo",   // Elli → echo
  "TxGEqnHWrfWFTfGW9XjX": "fable",  // Josh → fable
  "VR6AewLTigWG4xSOukaG": "onyx",   // Arnold → onyx
  "pNInz6obpgDQGcFmaJgB": "shimmer", // Adam → shimmer
  // Default fallback
  "default": "alloy"
};

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
  let creditsDeducted = false; // Track if credits were deducted for refund
  let storyIdForRefund: string | null = null;
  let userIdForRefund: string | null = null;

  try {
    logger = new JobLogger(scene_id, "generate_audio");
    logger.log(`🎙️ Starting audio generation for scene: ${scene_id}`);
    logger.log(`🎤 Received voice_id from request: ${voice_id}`);

    const voiceId = voice_id || "alloy"; // Default to OpenAI's Alloy voice
    logger.log(`🎤 Using voice_id (after default): ${voiceId}`);

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

    // 🔐 Get authenticated user from session
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    const userId = user.id;
    logger.log(`👤 User ID: ${userId} (${user.email})`);

    // Fetch story for title (for logging)
    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("title")
      .eq("id", scene.story_id)
      .single();

    if (storyError || !story) {
      throw new Error("Story not found");
    }

    // 💳 Charge 1 credit per audio scene
    const creditsNeeded = CREDIT_COSTS.AUDIO_PER_SCENE;
    logger.log(`💳 Credits needed: ${creditsNeeded} (1 credit per audio)`);

    // Check credit balance
    const currentBalance = await getUserCredits(userId);
    logger.log(`💰 Current balance: ${currentBalance} credits`);

    if (currentBalance < creditsNeeded) {
      logger.log(`❌ Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`);
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credit for audio generation, but you only have ${currentBalance}.`,
        required_credits: creditsNeeded,
        current_balance: currentBalance
      });
    }

    // Deduct credits for this audio scene
    const deductResult = await deductCredits(
      userId,
      creditsNeeded,
      'deduction_audio',
      `Audio generation for scene in story: ${story.title || scene.story_id}`,
      scene.story_id
    );

    if (!deductResult.success) {
      logger.log(`❌ Failed to deduct credits: ${deductResult.error}`);
      return res.status(500).json({ error: deductResult.error });
    }

    logger.log(`✅ Deducted ${creditsNeeded} credit. New balance: ${deductResult.newBalance}`);

    // Map voice ID to OpenAI voice name
    const openaiVoice = VOICE_MAPPING[voiceId] || VOICE_MAPPING["default"];
    logger.log(`🎤 Mapped voice to OpenAI: ${openaiVoice}`);

    // Track for potential refund if generation fails
    creditsDeducted = true;
    storyIdForRefund = scene.story_id;
    userIdForRefund = userId;

    // 2️⃣ Generate audio with OpenAI TTS
    const audioModel = process.env.AUDIO_MODEL || "tts-1-hd";
    logger.log(`🧠 Generating TTS with OpenAI voice: ${openaiVoice} (model: ${audioModel})`);
    const ttsRes = await fetch(OPENAI_TTS_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: audioModel,
        input: sceneText,
        voice: openaiVoice,
        response_format: "mp3",
        speed: 1.0 // Normal speed
      }),
    });

    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      logger.error(`❌ OpenAI TTS error: ${errorText}`);
      throw new Error(`OpenAI TTS failed: ${errorText}`);
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    logger.log(`✅ Audio generated successfully`);

    // 3️⃣ Save locally
    const tempDir = path.join(process.cwd(), "tmp", scene_id);
    fs.mkdirSync(tempDir, { recursive: true });
    const audioPath = path.join(tempDir, `scene-${scene_id}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    // 4️⃣ Get duration
    const info = await ffprobeAsync(audioPath);
    const duration = info.format?.duration || 0;
    logger.log(`⏱ Audio duration: ${duration.toFixed(2)} seconds`);

    // 5️⃣ Generate word-level timestamps using forced alignment
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

    // 6️⃣ Delete old audio files for this scene (all versions)
    const oldFilePattern = `scene-${scene_id}`;
    logger.log(`🗑️ Removing any existing audio files for scene: ${oldFilePattern}*`);

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
        logger.log(`🗑️ Deleted ${filesToDelete.length} old file(s)`);
      }
    }

    // 7️⃣ Upload new audio to Supabase with timestamp to prevent caching
    const timestamp = Date.now();
    const fileName = `scene-${scene_id}-${timestamp}.mp3`;
    logger.log(`☁️ Uploading new audio file: ${fileName}`);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("audio")
      .upload(fileName, fs.readFileSync(audioPath), {
        contentType: "audio/mpeg",
        upsert: false,
        cacheControl: 'no-cache, no-store, must-revalidate' // Prevent browser caching
      });
    if (uploadErr) throw uploadErr;
    logger.log(`✅ Audio uploaded successfully`);

    const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${fileName}`;

    // 8️⃣ Update scene with audio URL, voice_id, duration, word timestamps, and set audio_generated_at timestamp
    logger.log(`💾 Updating scene ${scene_id} with voice_id: ${voiceId}`);
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

    if (updateErr) {
      logger.error(`❌ Database update error:`, updateErr);
      throw updateErr;
    }
    logger.log(`✅ Scene updated successfully with voice_id: ${voiceId}`);

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

    // 💳 Auto-refund credits if generation failed and credits were deducted
    if (creditsDeducted && userIdForRefund && storyIdForRefund) {
      try {
        const refundAmount = CREDIT_COSTS.AUDIO_PER_SCENE;
        logger?.log(`💸 Refunding ${refundAmount} credit due to generation failure...`);

        const { data: story } = await supabaseAdmin
          .from("stories")
          .select("title")
          .eq("id", storyIdForRefund)
          .single();

        const refundResult = await refundCredits(
          userIdForRefund,
          refundAmount,
          `Refund: Audio generation failed for story ${story?.title || storyIdForRefund}`,
          storyIdForRefund
        );

        if (refundResult.success) {
          logger?.log(`✅ Refunded ${refundAmount} credit. New balance: ${refundResult.newBalance}`);
        } else {
          logger?.error(`❌ Failed to refund credits`);
        }
      } catch (refundErr: any) {
        logger?.error(`❌ Error during refund process: ${refundErr.message}`);
      }
    }

    res.status(500).json({ error: err.message });
  }
}
