import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getUserLogger } from "../../../lib/userLogger";
import fetch from "node-fetch";
import { YoutubeTranscript } from '@danielxceron/youtube-transcript';

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Extract YouTube video ID from URL
function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Clean transcript segment
function cleanSegmentText(text: string): string {
  let cleaned = decodeHtmlEntities(text);
  cleaned = cleaned
    .replace(/\[.*?\]/g, '')              // [Music], [Applause], etc.
    .replace(/\(.*?\)/g, '')              // (music), etc.
    .replace(/♪+/g, '')                   // Music symbols
    .replace(/🎵|🎶/g, '')                // Music emojis
    .replace(/speaker\s*\d*\s*:/gi, '')   // Speaker 1:, etc.
    .replace(/>>/g, '')                   // >> indicators
    .replace(/\s+/g, ' ')                 // Normalize whitespace
    .trim();
  return cleaned;
}

// Fetch YouTube transcript with timestamps
async function fetchYoutubeTranscript(videoId: string): Promise<Array<{ text: string; offset: number; duration: number }>> {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  return transcript.map(segment => ({
    text: cleanSegmentText(segment.text),
    offset: segment.offset,      // Already in seconds
    duration: segment.duration   // Already in seconds
  })).filter(s => s.text.length > 0);
}

// LLM prompt
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

  const { parent_video_id } = req.body;

  if (!parent_video_id) {
    return res.status(400).json({ error: 'parent_video_id is required' });
  }

  let logger: ReturnType<typeof getUserLogger> | null = null;

  try {
    // Auth check
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
    logger.info(`🎬 Starting shorts analysis for ${parent_video_id}`);

    // Load source video
    const { data: sourceVideo, error: videoError } = await supabaseAdmin
      .from('cut_short_videos')
      .select('id, title, youtube_url, duration, transcript')
      .eq('id', parent_video_id)
      .single();

    if (videoError || !sourceVideo) {
      throw new Error('Source video not found');
    }

    const videoDuration = sourceVideo.duration || 0;

    if (videoDuration < 30) {
      return res.status(400).json({
        error: 'Video too short for shorts generation (minimum 30 seconds)'
      });
    }

    // Get YouTube video ID
    const youtubeVideoId = extractYoutubeVideoId(sourceVideo.youtube_url);
    if (!youtubeVideoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Fetch YouTube transcript (instant, no download needed)
    logger.info(`📝 Fetching YouTube transcript...`);
    const transcriptSegments = await fetchYoutubeTranscript(youtubeVideoId);
    logger.info(`✅ Got ${transcriptSegments.length} transcript segments`);

    // Format transcript with timestamps for LLM
    const formattedTranscript = transcriptSegments
      .map(s => `[${s.offset.toFixed(1)}s] ${s.text}`)
      .join(' ');

    // Save transcript text to database
    const fullText = transcriptSegments.map(s => s.text).join(' ');
    await supabaseAdmin
      .from('cut_short_videos')
      .update({ transcript: fullText })
      .eq('id', parent_video_id);

    // Call LLM
    logger.info(`🤖 Analyzing transcript for best shorts...`);

    const prompt = SHORTS_ANALYSIS_PROMPT
      .replace('{transcript}', formattedTranscript)
      .replace(/{duration}/g, videoDuration.toFixed(1));

    const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CUT_SHORTS_MODEL || 'deepseek/deepseek-r1-0528',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 10000,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      logger.error(`❌ LLM error: ${errorText}`);
      throw new Error(`LLM API error: ${errorText}`);
    }

    const llmData = await llmResponse.json() as any;

    if (llmData.error) {
      throw new Error(`LLM error: ${llmData.error.message || JSON.stringify(llmData.error)}`);
    }

    if (!llmData.choices || llmData.choices.length === 0) {
      throw new Error('LLM returned empty response');
    }

    const llmContent = llmData.choices[0]?.message?.content || '';
    logger.info(`📝 LLM response length: ${llmContent.length} chars`);

    // Parse JSON from LLM response
    let shortsData: { shorts: Array<any> };
    try {
      // Try to extract JSON from response (handle markdown code blocks)
      let jsonStr = llmContent;
      const jsonMatch = llmContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      // Also try to find raw JSON object
      const rawJsonMatch = jsonStr.match(/\{[\s\S]*"shorts"[\s\S]*\}/);
      if (rawJsonMatch) {
        jsonStr = rawJsonMatch[0];
      }
      shortsData = JSON.parse(jsonStr);
    } catch (parseError: any) {
      logger.error(`❌ Failed to parse LLM response: ${parseError.message}`);
      logger.error(`Raw content: ${llmContent.substring(0, 500)}`);
      throw new Error('Failed to parse LLM response as JSON');
    }

    if (!shortsData.shorts || !Array.isArray(shortsData.shorts)) {
      throw new Error('Invalid shorts data structure');
    }

    logger.info(`✅ Found ${shortsData.shorts.length} potential shorts`);

    // Delete existing shorts for this video
    await supabaseAdmin
      .from('shorts')
      .delete()
      .eq('parent_video_id', parent_video_id);

    // Insert new shorts
    const shortsToInsert = shortsData.shorts.map((s: any) => ({
      parent_video_id: parent_video_id,
      user_id: user.id,
      start_time: s.start,
      end_time: s.end,
      duration: s.end - s.start,
      title: s.title,
      hook_line: s.hook_line,
      score: s.score,
      reason: s.reason,
    }));

    const { data: insertedShorts, error: insertError } = await supabaseAdmin
      .from('shorts')
      .insert(shortsToInsert)
      .select();

    if (insertError) {
      logger.error(`❌ Failed to insert shorts: ${insertError.message}`);
      throw insertError;
    }

    logger.info(`✅ Inserted ${insertedShorts?.length || 0} shorts`);

    return res.status(200).json({
      success: true,
      shorts: insertedShorts,
    });

  } catch (err: any) {
    if (logger) {
      logger.error(`❌ Error: ${err.message}`);
    }
    console.error(`❌ Error analyzing shorts: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
