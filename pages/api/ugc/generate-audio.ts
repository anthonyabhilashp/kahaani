import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";
import { deductCredits } from "../../../lib/credits";

const OPENAI_TTS_API = "https://api.openai.com/v1/audio/speech";

// Voice mapping (same as existing generate_audio.ts)
const VOICE_MAPPING: { [key: string]: string } = {
  "alloy": "alloy",
  "echo": "echo",
  "fable": "fable",
  "onyx": "onyx",
  "nova": "nova",
  "shimmer": "shimmer",
  "ash": "ash",
  "coral": "coral",
  "sage": "sage",
  "default": "alloy"
};

function ffprobeAsync(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ugc_video_id, voice_id } = req.body;

  if (!ugc_video_id) {
    return res.status(400).json({ error: "ugc_video_id is required" });
  }

  let logger: any = null;

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

    logger = getUserLogger(user.id);
    logger.info(`[UGC] Generating audio for video: ${ugc_video_id}`);

    // 🔒 Verify ownership and get clips
    const { data: ugcVideo, error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .select('id, user_id, title, voice_id')
      .eq('id', ugc_video_id)
      .single();

    if (videoError || !ugcVideo) {
      return res.status(404).json({ error: "UGC video not found" });
    }

    if (ugcVideo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data: clips, error: clipsError } = await supabaseAdmin
      .from('ugc_clips')
      .select('*')
      .eq('ugc_video_id', ugc_video_id)
      .order('order_index', { ascending: true });

    if (clipsError || !clips || clips.length === 0) {
      return res.status(404).json({ error: "No clips found" });
    }

    logger.info(`Found ${clips.length} clips to generate audio for`);

    // 💳 Check credits
    const AUDIO_COST_PER_CLIP = 1;
    const totalCost = clips.length * AUDIO_COST_PER_CLIP;

    const { data: userCredits } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!userCredits || userCredits.balance < totalCost) {
      logger.warn(`Insufficient credits. Need ${totalCost}, have ${userCredits?.balance || 0}`);
      return res.status(402).json({
        error: "Insufficient credits",
        balance: userCredits?.balance || 0,
        required: totalCost
      });
    }

    // 🎙️ Generate audio for all clips
    const voiceToUse = voice_id || ugcVideo.voice_id || 'nova';
    const openaiVoice = VOICE_MAPPING[voiceToUse] || 'nova';
    const audioModel = process.env.AUDIO_MODEL || "tts-1-hd";

    logger.info(`Using voice: ${openaiVoice} (model: ${audioModel})`);

    const tempDir = path.join(process.cwd(), "tmp", ugc_video_id);
    fs.mkdirSync(tempDir, { recursive: true });

    const updatedClips = [];

    for (const clip of clips) {
      try {
        logger.info(`Generating audio for clip ${clip.order_index}...`);

        // Generate TTS with casual, conversational style
        // Slightly slower speed (0.95) for more natural UGC feel
        const ttsRes = await fetch(OPENAI_TTS_API, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: audioModel,
            input: clip.text,
            voice: openaiVoice,
            response_format: "mp3",
            speed: 0.95 // Slightly slower for casual UGC feel
          }),
        });

        if (!ttsRes.ok) {
          const errorText = await ttsRes.text();
          logger.error(`TTS error for clip ${clip.order_index}: ${errorText}`);
          continue;
        }

        const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

        // Save locally
        const audioPath = path.join(tempDir, `clip-${clip.order_index}.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);

        // Get actual duration
        const info = await ffprobeAsync(audioPath);
        const actualDuration = info.format?.duration || clip.duration;

        logger.info(`Clip ${clip.order_index}: Audio duration ${actualDuration.toFixed(2)}s`);

        // Note: Word timestamps not needed for HeyGen UGC ads (HeyGen handles lip-sync)
        const wordTimestamps: any[] = [];

        // Upload to Supabase Storage
        const audioFile = fs.readFileSync(audioPath);
        const fileName = `ugc_audio/${ugc_video_id}/clip-${clip.order_index}.mp3`;

        const { data: uploadData, error: uploadError } = await supabaseAdmin
          .storage
          .from('audio')
          .upload(fileName, audioFile, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          logger.error(`Upload error for clip ${clip.order_index}: ${uploadError.message}`);
          continue;
        }

        const { data: { publicUrl } } = supabaseAdmin
          .storage
          .from('audio')
          .getPublicUrl(fileName);

        // Update clip in database
        const { error: updateError } = await supabaseAdmin
          .from('ugc_clips')
          .update({
            audio_url: publicUrl,
            duration: actualDuration,
            word_timestamps: wordTimestamps,
            audio_generated_at: new Date().toISOString()
          })
          .eq('id', clip.id);

        if (!updateError) {
          updatedClips.push({
            id: clip.id,
            order_index: clip.order_index,
            audio_url: publicUrl,
            duration: actualDuration,
            word_count: wordTimestamps.length
          });
          logger.info(`✓ Clip ${clip.order_index} audio generated and uploaded`);
        }

        // Cleanup local file
        fs.unlinkSync(audioPath);

      } catch (error: any) {
        logger.error(`Error generating audio for clip ${clip.order_index}: ${error.message}`);
      }
    }

    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    // 💳 Deduct credits AFTER successful generation
    const creditsToDeduct = updatedClips.length * AUDIO_COST_PER_CLIP;
    const deductResult = await deductCredits(
      user.id,
      creditsToDeduct,
      `ugc_audio_generation`,
      `UGC Audio Generation: ${ugcVideo.title} (${updatedClips.length} clips)`
    );

    if (!deductResult.success) {
      logger.error(`Credit deduction failed: ${deductResult.error}`);
    }

    // Update total duration in ugc_videos table
    const totalDuration = updatedClips.reduce((sum, c) => sum + c.duration, 0);
    await supabaseAdmin
      .from('ugc_videos')
      .update({ duration: totalDuration })
      .eq('id', ugc_video_id);

    logger.info(`✅ Audio generation complete. ${updatedClips.length}/${clips.length} clips successful`);

    return res.status(200).json({
      success: true,
      ugc_video_id,
      clips: updatedClips,
      total_duration: totalDuration,
      credits_deducted: creditsToDeduct,
      credits_remaining: deductResult.newBalance
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Audio generation failed: ${error.message}`);
      logger.error(error.stack);
    }

    return res.status(500).json({
      error: "Failed to generate audio",
      details: error.message
    });
  }
}
