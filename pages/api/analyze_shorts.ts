import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import * as Echogarden from "echogarden";
import { getUserLogger } from "../../lib/userLogger";
import fetch from "node-fetch";
import { YoutubeTranscript } from '@danielxceron/youtube-transcript';

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
    whisper: {
      model: 'small',           // Better quality than tiny/base (less hallucination)
      temperature: 0.0,          // Reduce randomness/hallucination
      prompt: undefined,         // No initial prompt (avoid biasing)
    }
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

// Helper to extract YouTube video ID from URL
function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null;

  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Just the video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// Helper to fetch YouTube transcript (fast, free)
async function fetchYoutubeTranscript(videoId: string): Promise<{
  text: string;
  word_timestamps: Array<{ word: string; start: number; end: number }>;
}> {
  // Fetch transcript from YouTube
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);

  // YouTube transcript format: [{ text: "Hello world", offset: 0, duration: 1500 }, ...]
  // offset and duration are in milliseconds

  // Convert to word-level timestamps
  const word_timestamps: Array<{ word: string; start: number; end: number }> = [];
  let fullText = '';

  for (const segment of transcript) {
    const words = segment.text.split(/\s+/).filter(w => w.length > 0);
    const startTime = segment.offset / 1000; // Convert ms to seconds
    const duration = segment.duration / 1000;
    const timePerWord = duration / Math.max(words.length, 1);

    words.forEach((word, index) => {
      const wordStart = startTime + (index * timePerWord);
      const wordEnd = wordStart + timePerWord;

      word_timestamps.push({
        word: word,
        start: wordStart,
        end: wordEnd
      });

      fullText += (fullText ? ' ' : '') + word;
    });
  }

  return {
    text: fullText,
    word_timestamps
  };
}

// LLM prompt to identify best short segments
const SHORTS_ANALYSIS_PROMPT = `You are a professional short-form video editor who specializes in turning long videos into viral YouTube Shorts, TikToks, and Instagram Reels.

Your task: analyze the transcript and identify the BEST moments that have the highest viral potential.

VIRAL MOMENTS ARE CLIPS THAT:
- Hook attention within the first 2 seconds
- Deliver emotion, humor, surprise, controversy, or strong value
- Have a clear payoff or takeaway
- Can stand alone without needing context
- Would make a viewer stop scrolling

AVOID:
- Slow explanations
- Filler talk
- Greetings or sponsor segments
- Moments requiring full video context to understand

TRANSCRIPT (with timestamps in seconds):
{transcript}

VIDEO LENGTH: {duration} seconds

=== OUTPUT REQUIREMENTS ===
For each selected short, return:
1. "start" — starting timestamp in seconds
2. "end" — ending timestamp in seconds
3. "title" — short headline that would make someone want to click
4. "hook_line" — the first 3–10 words of the speech in that clip (to be used as on-screen text)
5. "score" — a virality score from 1–100
6. "reason" — why this clip would perform well

CLIP RULES:
- Ideal length: 12–45 seconds (but can be longer if extremely strong)
- Must start & end at natural sentence boundaries
- Start must be >= 0 and end must be <= {duration}
- Do not output duplicate or overlapping segments

RETURN FORMAT:
Return ONLY pure JSON. Do not include markdown, code blocks, or comments.
{
  "shorts": [
    {
      "start": 123.4,
      "end": 144.9,
      "title": "He exposed a shocking truth about jobs",
      "hook_line": "Nobody tells you this about your job...",
      "score": 93,
      "reason": "High emotion, strong curiosity hook, impactful message"
    }
  ]
}

=== FINAL INSTRUCTION (IMPORTANT) ===
Identify ALL possible shorts, but rank them in descending order by score — the strongest viral clips first.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scene_id, story_id, video_url, min_duration = 30, max_duration = 60 } = req.body;

  if (!scene_id) {
    return res.status(400).json({ error: 'scene_id is required' });
  }

  let logger: ReturnType<typeof getUserLogger> | null = null;
  let tempDir = '';

  try {
    // 🔐 Get authenticated user FIRST to use their ID for logging
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    // Create logger with user ID (creates logs/{user_id}.log)
    logger = getUserLogger(user.id);
    tempDir = path.join(tmpdir(), `shorts_${Date.now()}`);

    logger.info(`🎬 Starting shorts analysis for story ${story_id}`);

    // Load existing scene data
    logger.info(`📄 Loading scene data from database...`);
    const { data: scene, error: sceneError } = await supabaseAdmin
      .from('scenes')
      .select('id, story_id, text, word_timestamps, duration, video_url, audio_url, youtube_url')
      .eq('id', scene_id)
      .single();

    if (sceneError || !scene) {
      throw new Error('Scene not found');
    }

    let text = scene.text;
    let word_timestamps = scene.word_timestamps as Array<{ word: string; start: number; end: number }>;
    const videoDuration = scene.duration || 0;

    // Check if transcription is missing (for cut_shorts videos uploaded without transcription)
    if (!text || !word_timestamps || word_timestamps.length === 0) {
      logger.info(`📝 Transcript missing, transcribing on-demand...`);

      // Try YouTube transcript first (if youtube_url exists)
      const youtubeVideoId = scene.youtube_url ? extractYoutubeVideoId(scene.youtube_url) : null;

      if (youtubeVideoId) {
        try {
          logger.info(`🎬 Fetching YouTube transcript for video ID: ${youtubeVideoId}...`);
          const transcription = await fetchYoutubeTranscript(youtubeVideoId);
          text = transcription.text;
          word_timestamps = transcription.word_timestamps;
          logger.info(`✅ YouTube transcript fetched (instant): "${text.substring(0, 100)}..."`);
          logger.info(`📝 Generated ${word_timestamps.length} word timestamps`);
        } catch (ytError: any) {
          logger.warn(`⚠️ Failed to fetch YouTube transcript: ${ytError.message}`);
          logger.info(`🔄 Falling back to Whisper transcription...`);
          // Fall through to Echogarden transcription below
        }
      }

      // If YouTube transcript failed or not available, use Echogarden
      if (!text || !word_timestamps || word_timestamps.length === 0) {
        if (!scene.audio_url) {
          throw new Error('Cannot transcribe: audio_url not found. Please re-upload the video.');
        }

        // Download audio from Supabase Storage
        const audioPath = path.join(tmpdir(), `scene-audio-${scene_id}-${Date.now()}.mp3`);
        logger.info(`📥 Downloading audio from: ${scene.audio_url}`);
        await downloadVideo(scene.audio_url, audioPath);

        // Transcribe with Echogarden
        logger.info(`🎙️ Transcribing audio with Whisper (local)...`);
        const transcription = await transcribeWithEchogarden(audioPath);
        text = transcription.text;
        word_timestamps = transcription.word_timestamps;
        logger.info(`✅ Transcription complete: "${text.substring(0, 100)}..."`);
        logger.info(`📝 Generated ${word_timestamps.length} word timestamps`);

        // Cleanup temp audio file
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }

      // Save transcript to database
      logger.info(`💾 Saving transcript to database...`);
      const { error: updateError } = await supabaseAdmin
        .from('scenes')
        .update({
          text: text,
          word_timestamps: word_timestamps,
          last_modified_at: new Date().toISOString(),
        })
        .eq('id', scene_id);

      if (updateError) {
        logger.error(`❌ Failed to save transcript: ${updateError.message}`);
      } else {
        logger.info(`✅ Transcript saved to database`);
      }
    }

    if (videoDuration < 30) {
      return res.status(400).json({
        error: 'Video too short for shorts generation (minimum 30 seconds)'
      });
    }

    logger.info(`✅ Transcript ready: ${word_timestamps.length} words, duration: ${videoDuration.toFixed(1)}s`);

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
        model: process.env.CUT_SHORTS_MODEL || 'deepseek/deepseek-r1-0528',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 10000,  // Allow for many shorts (50+) + reasoning tokens
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      logger.error(`❌ LLM API HTTP error (${llmResponse.status}): ${errorText}`);
      throw new Error(`LLM API error: ${errorText}`);
    }

    const llmData = await llmResponse.json() as any;

    // Log full response structure for debugging
    logger.info(`📦 LLM response structure: ${JSON.stringify({
      hasChoices: !!llmData.choices,
      choicesLength: llmData.choices?.length,
      hasError: !!llmData.error,
      error: llmData.error
    })}`);

    if (llmData.error) {
      logger.error(`❌ LLM returned error: ${JSON.stringify(llmData.error)}`);
      throw new Error(`LLM API error: ${llmData.error.message || JSON.stringify(llmData.error)}`);
    }

    if (!llmData.choices || llmData.choices.length === 0) {
      logger.error(`❌ LLM response has no choices: ${JSON.stringify(llmData)}`);
      throw new Error('LLM returned empty response');
    }

    const llmContent = llmData.choices[0]?.message?.content || '';

    // Log full response for debugging (first 2000 chars)
    logger.info(`📝 LLM raw response (first 2000 chars): ${llmContent.substring(0, 2000)}`);

    // Parse JSON from LLM response
    let shorts;
    try {
      // DeepSeek R1 wraps reasoning in <think> tags, extract content after </think>
      let cleanedContent = llmContent;
      if (llmContent.includes('</think>')) {
        logger.info('🔍 Detected DeepSeek R1 format with <think> tags');
        cleanedContent = llmContent.split('</think>')[1] || llmContent;
      }

      // Extract JSON from response (find first { to last })
      const firstBrace = cleanedContent.indexOf('{');
      const lastBrace = cleanedContent.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        logger.error('❌ No JSON braces found in LLM response');
        logger.error(`Cleaned content: ${cleanedContent.substring(0, 1000)}`);
        throw new Error('No JSON found in LLM response');
      }

      const jsonString = cleanedContent.substring(firstBrace, lastBrace + 1);
      logger.info(`📦 Extracted JSON string: ${jsonString.substring(0, 500)}...`);

      const parsed = JSON.parse(jsonString);
      shorts = parsed.shorts;
      logger.info(`🔍 LLM returned ${shorts?.length || 0} shorts before validation`);
    } catch (parseError: any) {
      logger.error(`❌ Parse error: ${parseError.message}`);
      logger.error(`Full LLM response: ${llmContent}`);
      throw new Error('Failed to parse shorts suggestions from AI');
    }

    // Validate and adjust shorts (keep ALL LLM suggestions, only sanity check bounds)
    const validatedShorts = shorts
      .filter((short: any) => {
        const isValid = short.start >= 0 && short.end <= videoDuration;
        if (!isValid && logger) {
          logger.warn(`⚠️ Filtered out short: ${short.title} (${short.start}s-${short.end}s) - out of bounds (video duration: ${videoDuration}s)`);
        }
        return isValid;
      })
      .map((short: any, index: number) => ({
        id: `short_${index + 1}`,
        start: Math.round(short.start * 10) / 10,
        end: Math.round(short.end * 10) / 10,
        duration: Math.round((short.end - short.start) * 10) / 10,
        title: short.title,
        hook_line: short.hook_line || '',
        score: short.score || 0,
        reason: short.reason,
      }));

    logger.info(`✅ Found ${validatedShorts.length} valid shorts (from ${shorts?.length || 0} total suggestions)`);

    // Save shorts to database
    logger.info(`💾 Saving ${validatedShorts.length} shorts to database...`);

    // First, delete any existing shorts for this scene
    const { error: deleteError } = await supabaseAdmin
      .from('shorts')
      .delete()
      .eq('scene_id', scene_id);

    if (deleteError) {
      logger.warn(`⚠️ Failed to delete existing shorts: ${deleteError.message}`);
    }

    // Insert new shorts
    const shortsToInsert = validatedShorts.map((short: any, index: number) => ({
      user_id: user.id,
      scene_id: scene_id,
      story_id: scene.story_id,
      start_time: short.start,
      end_time: short.end,
      duration: short.duration,
      title: short.title,
      hook_line: short.hook_line || null,
      score: short.score || null,
      reason: short.reason,
      order: index,
      video_url: null, // Will be generated later
      thumbnail_url: null,
    }));

    const { data: insertedShorts, error: insertError } = await supabaseAdmin
      .from('shorts')
      .insert(shortsToInsert)
      .select();

    if (insertError) {
      logger.error(`❌ Failed to save shorts: ${insertError.message}`);
      // Don't fail the request, shorts are returned anyway
    } else {
      logger.info(`✅ Saved ${insertedShorts?.length || 0} shorts to database`);
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
      shorts: insertedShorts || validatedShorts
    });

  } catch (err: any) {
    if (logger) {
      logger.error(`❌ Error analyzing shorts: ${err.message}`);
    }

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
