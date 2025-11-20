import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import * as Echogarden from "echogarden";
import { getUserLogger } from "../../lib/userLogger";
import fetch from "node-fetch";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Helper to get video duration using ffprobe
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration || 0;
      resolve(duration);
    });
  });
}

// Helper to extract audio from video
async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(audioPath)
      .audioCodec('libmp3lame')
      .noVideo()
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper to transcribe audio with Echogarden (local, free)
async function transcribeWithEchogarden(audioPath: string): Promise<{
  text: string;
  word_timestamps: Array<{ word: string; start: number; end: number }>;
}> {
  const recognitionResult = await Echogarden.recognize(audioPath, {
    engine: 'whisper',
    language: 'en',
  });

  // Extract word timestamps from wordTimeline
  const word_timestamps = recognitionResult.wordTimeline?.map((entry: any) => ({
    word: entry.text,
    start: entry.startTime,
    end: entry.endTime
  })) || [];

  return {
    text: recognitionResult.transcript || '',
    word_timestamps,
  };
}

// Helper to download video from URL
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download video: ${response.statusText}`);

  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
}

// LLM prompt to identify best short segments
const SHORTS_ANALYSIS_PROMPT = `You are an expert video editor specializing in creating viral short-form content.

Analyze this video transcript and identify the 3-5 BEST segments that would make engaging shorts (30-60 seconds each).

TRANSCRIPT WITH TIMESTAMPS:
{transcript}

TOTAL VIDEO DURATION: {duration} seconds

For each suggested short, identify:
1. Start time (in seconds)
2. End time (in seconds)
3. A catchy title for the short
4. Why this segment would perform well

IMPORTANT:
- Each short should be 30-60 seconds
- Look for strong hooks/openers
- Find complete thoughts with natural start/end points
- Prioritize emotional peaks, funny moments, surprising insights
- Avoid cutting mid-sentence
- Start times should align with word boundaries from timestamps

Return ONLY valid JSON in this exact format:
{
  "shorts": [
    {
      "start": 45.2,
      "end": 102.8,
      "title": "The moment everything changed",
      "reason": "Strong emotional hook + complete story arc"
    }
  ]
}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scene_id, story_id, video_url, min_duration = 30, max_duration = 60 } = req.body;

  if (!video_url) {
    return res.status(400).json({ error: 'video_url is required' });
  }

  const logger = getUserLogger(story_id || 'shorts_analyze');
  const tempDir = path.join(tmpdir(), `shorts_${Date.now()}`);

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

    logger.info(`🎬 Starting shorts analysis for user ${user.id}`);

    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    const videoPath = path.join(tempDir, 'input.mp4');
    const audioPath = path.join(tempDir, 'audio.mp3');

    // Download video
    logger.info(`📥 Downloading video...`);
    await downloadVideo(video_url, videoPath);

    // Get video duration
    const videoDuration = await getVideoDuration(videoPath);
    logger.info(`⏱ Video duration: ${videoDuration.toFixed(1)}s`);

    if (videoDuration < 30) {
      return res.status(400).json({
        error: 'Video too short for shorts generation (minimum 30 seconds)'
      });
    }

    // Extract audio
    logger.info(`🔊 Extracting audio...`);
    await extractAudio(videoPath, audioPath);

    // Transcribe with timestamps
    logger.info(`📝 Transcribing audio...`);
    const { text, word_timestamps } = await transcribeWithEchogarden(audioPath);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Could not transcribe audio - no speech detected'
      });
    }

    logger.info(`✅ Transcribed ${word_timestamps.length} words`);

    // Format transcript with timestamps for LLM
    const formattedTranscript = word_timestamps
      .map(w => `[${w.start.toFixed(1)}s] ${w.word}`)
      .join(' ');

    // Call LLM to identify best segments
    logger.info(`🤖 Analyzing transcript for best shorts...`);

    const prompt = SHORTS_ANALYSIS_PROMPT
      .replace('{transcript}', formattedTranscript)
      .replace('{duration}', videoDuration.toFixed(1));

    const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.SCENE_MODEL || 'anthropic/claude-3-haiku',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      throw new Error(`LLM API error: ${errorText}`);
    }

    const llmData = await llmResponse.json() as any;
    const llmContent = llmData.choices?.[0]?.message?.content || '';

    // Parse JSON from LLM response
    let shorts;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }
      const parsed = JSON.parse(jsonMatch[0]);
      shorts = parsed.shorts;
    } catch (parseError) {
      logger.error(`Failed to parse LLM response: ${llmContent}`);
      throw new Error('Failed to parse shorts suggestions from AI');
    }

    // Validate and adjust shorts
    const validatedShorts = shorts
      .filter((short: any) => {
        const duration = short.end - short.start;
        return duration >= min_duration && duration <= max_duration && short.start >= 0 && short.end <= videoDuration;
      })
      .map((short: any, index: number) => ({
        id: `short_${index + 1}`,
        start: Math.round(short.start * 10) / 10,
        end: Math.round(short.end * 10) / 10,
        duration: Math.round((short.end - short.start) * 10) / 10,
        title: short.title,
        reason: short.reason,
      }));

    logger.info(`✅ Found ${validatedShorts.length} valid shorts`);

    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn('Failed to cleanup temp files');
    }

    // Track analytics
    await supabaseAdmin.from("analytics_events").insert({
      user_id: user.id,
      event_name: 'shorts_analyzed',
      event_data: {
        story_id,
        scene_id,
        video_duration: videoDuration,
        shorts_found: validatedShorts.length
      }
    });

    res.status(200).json({
      success: true,
      video_duration: videoDuration,
      transcript: text,
      shorts: validatedShorts
    });

  } catch (err: any) {
    logger.error(`❌ Error analyzing shorts: ${err.message}`);

    // Cleanup temp files on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    res.status(500).json({ error: err.message });
  }
}
