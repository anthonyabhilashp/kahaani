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

  let logger: any = null;
  let storyIdForLog: string | null = null;

  try {
    // 1️⃣ Fetch scene data (including video_url and duration for speed matching)
    const { data: scene, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, story_id, order, video_url, duration")
      .eq("id", scene_id)
      .single();

    if (sceneErr) throw sceneErr;
    if (!scene) throw new Error("Scene not found.");

    const sceneText = scene.text;
    storyIdForLog = scene.story_id;

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
    logger = getUserLogger(userId);

    if (logger) { logger.info(`[${scene.story_id}] 🎙️ Starting audio generation for scene: ${scene_id}`); }
    if (logger) { logger.info(`[${scene.story_id}] User: ${user.email}`); }
    if (logger) { logger.info(`[${scene.story_id}] 🎤 Received voice_id from request: ${voice_id}`); }

    const voiceId = voice_id || "alloy"; // Default to OpenAI's Alloy voice
    if (logger) { logger.info(`[${scene.story_id}] 🎤 Using voice_id (after default): ${voiceId}`); }
    if (logger) { logger.info(`[${scene.story_id}] 📖 Scene text length: ${sceneText.length} chars`); }

    // Fetch story for title (for logging)
    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("title")
      .eq("id", scene.story_id)
      .single();

    if (storyError || !story) {
      throw new Error("Story not found");
    }

    // 💳 Check credit balance (will deduct AFTER successful generation)
    const creditsNeeded = CREDIT_COSTS.AUDIO_PER_SCENE;
    if (logger) { logger.info(`[${scene.story_id}] 💳 Credits needed: ${creditsNeeded} (1 credit per audio - will charge after success)`); }

    // Check credit balance
    const currentBalance = await getUserCredits(userId);
    if (logger) { logger.info(`[${scene.story_id}] 💰 Current balance: ${currentBalance} credits`); }

    if (currentBalance < creditsNeeded) {
      if (logger) { logger.warn(`[${scene.story_id}] ❌ Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`); }
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credit for audio generation, but you only have ${currentBalance}.`,
        required_credits: creditsNeeded,
        current_balance: currentBalance
      });
    }

    // Map voice ID to OpenAI voice name
    const openaiVoice = VOICE_MAPPING[voiceId] || VOICE_MAPPING["default"];
    if (logger) { logger.info(`[${scene.story_id}] 🎤 Mapped voice to OpenAI: ${openaiVoice}`); }

    // Calculate TTS speed to match video duration (if video exists)
    let ttsSpeed = 1.0;
    const targetDuration = scene.video_url && scene.duration ? scene.duration : null;

    if (targetDuration) {
      // Estimate natural speech duration based on word count
      const wordCount = sceneText.trim().split(/\s+/).length;
      const wordsPerSecond = 2.5; // Average speaking rate
      const naturalDuration = wordCount / wordsPerSecond;

      // Calculate speed factor to match video duration
      ttsSpeed = naturalDuration / targetDuration;

      // Clamp speed to OpenAI's supported range (0.25 - 4.0)
      ttsSpeed = Math.max(0.25, Math.min(4.0, ttsSpeed));

      if (logger) { logger.info(`[${scene.story_id}] 🎯 Video duration detected: ${targetDuration.toFixed(2)}s`); }
      if (logger) { logger.info(`[${scene.story_id}] 📊 Word count: ${wordCount}, Natural duration: ${naturalDuration.toFixed(2)}s`); }
      if (logger) { logger.info(`[${scene.story_id}] ⚡ Adjusted TTS speed: ${ttsSpeed.toFixed(2)}x to match video`); }
    }

    // 2️⃣ Generate audio with OpenAI TTS
    const audioModel = process.env.AUDIO_MODEL || "tts-1-hd";
    if (logger) { logger.info(`[${scene.story_id}] 🧠 Generating TTS with OpenAI voice: ${openaiVoice} (model: ${audioModel})`); }
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
        speed: ttsSpeed
      }),
    });

    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      if (logger) { logger.error(`[${scene.story_id}] ❌ OpenAI TTS error: ${errorText}`); }
      throw new Error(`OpenAI TTS failed: ${errorText}`);
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    if (logger) { logger.info(`[${scene.story_id}] ✅ Audio generated successfully`); }

    // 3️⃣ Save locally
    const tempDir = path.join(process.cwd(), "tmp", scene_id);
    fs.mkdirSync(tempDir, { recursive: true });
    const audioPath = path.join(tempDir, `scene-${scene_id}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    // 4️⃣ Get duration
    const info = await ffprobeAsync(audioPath);
    let duration = info.format?.duration || 0;
    if (logger) { logger.info(`[${scene.story_id}] ⏱ Audio duration: ${duration.toFixed(2)} seconds`); }

    // 4.5️⃣ Adjust audio to match video duration exactly using FFmpeg (if video exists)
    if (targetDuration && Math.abs(duration - targetDuration) > 0.5) {
      if (logger) { logger.info(`[${scene.story_id}] 🔧 Fine-tuning audio duration to match video exactly...`); }

      const tempoFactor = duration / targetDuration; // Speed up/slow down
      if (logger) { logger.info(`[${scene.story_id}] 📐 Tempo adjustment factor: ${tempoFactor.toFixed(3)}x`); }

      const adjustedAudioPath = path.join(tempDir, `scene-${scene_id}-adjusted.mp3`);

      await new Promise<void>((resolve, reject) => {
        // FFmpeg atempo filter supports 0.5 to 2.0 range
        // For values outside this range, we chain multiple atempo filters
        let filterComplex = '';

        if (tempoFactor >= 0.5 && tempoFactor <= 2.0) {
          filterComplex = `atempo=${tempoFactor.toFixed(3)}`;
        } else if (tempoFactor < 0.5) {
          // Chain multiple atempo filters for very slow speeds
          filterComplex = `atempo=0.5,atempo=${(tempoFactor / 0.5).toFixed(3)}`;
        } else {
          // Chain multiple atempo filters for very fast speeds
          filterComplex = `atempo=2.0,atempo=${(tempoFactor / 2.0).toFixed(3)}`;
        }

        ffmpeg(audioPath)
          .audioFilters(filterComplex)
          .output(adjustedAudioPath)
          .on('end', () => {
            if (logger) { logger.info(`[${scene.story_id}] ✅ Audio duration adjusted successfully`); }
            resolve();
          })
          .on('error', (err) => {
            if (logger) { logger.error(`[${scene.story_id}] ❌ FFmpeg adjustment error: ${err.message}`); }
            reject(err);
          })
          .run();
      });

      // Replace original audio with adjusted version
      fs.unlinkSync(audioPath);
      fs.renameSync(adjustedAudioPath, audioPath);

      // Get new duration
      const adjustedInfo = await ffprobeAsync(audioPath);
      duration = adjustedInfo.format?.duration || targetDuration;
      if (logger) { logger.info(`[${scene.story_id}] ⏱ Final audio duration: ${duration.toFixed(2)} seconds (target: ${targetDuration.toFixed(2)}s)`); }
    }

    // 5️⃣ Generate word-level timestamps using forced alignment
    if (logger) { logger.info(`[${scene.story_id}] 🔍 Generating word-level timestamps with forced alignment...`); }
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

      if (logger) { logger.info(`[${scene.story_id}] ✅ Generated ${wordTimestamps.length} word timestamps`); }
    } catch (alignErr: any) {
      if (logger) { logger.warn(`[${scene.story_id}] ⚠️ Word alignment failed, continuing without timestamps: ${alignErr.message}`); }
      // Continue without timestamps rather than failing completely
    }

    // 6️⃣ Delete old audio files for this scene (all versions)
    const oldFilePattern = `scene-${scene_id}`;
    if (logger) { logger.info(`[${scene.story_id}] 🗑️ Removing any existing audio files for scene: ${oldFilePattern}*`); }

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
        if (logger) { logger.info(`[${scene.story_id}] 🗑️ Deleted ${filesToDelete.length} old file(s)`); }
      }
    }

    // 7️⃣ Upload new audio to Supabase with timestamp to prevent caching
    const timestamp = Date.now();
    const fileName = `scene-${scene_id}-${timestamp}.mp3`;
    if (logger) { logger.info(`[${scene.story_id}] ☁️ Uploading new audio file: ${fileName}`); }
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("audio")
      .upload(fileName, fs.readFileSync(audioPath), {
        contentType: "audio/mpeg",
        upsert: false,
        cacheControl: 'no-cache, no-store, must-revalidate' // Prevent browser caching
      });
    if (uploadErr) throw uploadErr;
    if (logger) { logger.info(`[${scene.story_id}] ✅ Audio uploaded successfully`); }

    const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${fileName}`;

    // 8️⃣ Update scene with audio URL, voice_id, duration, word timestamps, and set audio_generated_at timestamp
    if (logger) { logger.info(`[${scene.story_id}] 💾 Updating scene ${scene_id} with voice_id: ${voiceId}`); }

    // Build update object
    const updateData: any = {
      audio_url: audioUrl,
      voice_id: voiceId,
      word_timestamps: wordTimestamps,
      audio_generated_at: new Date().toISOString()
    };

    // Only update duration if there's NO video or no existing duration
    // Video uploads already have correct duration from video file
    if (!scene.video_url || !scene.duration) {
      updateData.duration = duration;
      if (logger) { logger.info(`[${scene.story_id}] ⏱️ Setting duration from audio: ${duration.toFixed(2)}s`); }
    } else {
      if (logger) { logger.info(`[${scene.story_id}] ⏱️ Preserving existing video duration: ${scene.duration.toFixed(2)}s (video exists)`); }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("scenes")
      .update(updateData)
      .eq("id", scene_id);

    if (updateErr) {
      if (logger) { logger.error(`[${scene.story_id}] ❌ Database update error: ${updateErr.message}`); }
      throw updateErr;
    }
    if (logger) { logger.info(`[${scene.story_id}] ✅ Scene updated successfully with voice_id: ${voiceId}`); }

    // 9️⃣ Update story metadata (duration and completion status)
    if (logger) { logger.info(`[${scene.story_id}] 📊 Updating story metadata...`); }
    await updateStoryMetadata(scene.story_id);
    if (logger) { logger.info(`[${scene.story_id}] ✅ Story metadata updated`); }

    // 💳 Deduct credits AFTER successful audio generation
    if (logger) { logger.info(`[${scene.story_id}] 💳 Deducting ${creditsNeeded} credit after successful generation...`); }
    const deductResult = await deductCredits(
      userId,
      creditsNeeded,
      'deduction_audio',
      `Audio generation for scene in story: ${story.title || scene.story_id}`,
      scene.story_id
    );

    if (!deductResult.success) {
      if (logger) { logger.error(`[${scene.story_id}] ⚠️ Failed to deduct credits after generation: ${deductResult.error}`); }
      // Audio was generated successfully, so we don't fail the request
      // Admin can manually adjust credits if needed
    } else {
      if (logger) { logger.info(`[${scene.story_id}] ✅ Deducted ${creditsNeeded} credit. New balance: ${deductResult.newBalance}`); }
    }

    if (logger) { logger.info(`[${scene.story_id}] ✅ Audio saved to Supabase for scene: ${audioUrl}`); }
    res.status(200).json({
      scene_id,
      story_id: scene.story_id,
      voice_id: voiceId,
      audio_url: audioUrl,
      duration,
      word_timestamps: wordTimestamps
    });
  } catch (err: any) {
    // No refund needed since credits are only deducted after success
    if (logger && storyIdForLog) {
      if (logger) { logger.error(`[${storyIdForLog}] ❌ Error during audio generation: ${err.message}`); }
    } else {
      console.error(`❌ Error during audio generation: ${err.message}`);
    }
    res.status(500).json({ error: err.message });
  }
}
