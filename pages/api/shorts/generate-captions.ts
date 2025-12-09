import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import * as Echogarden from "echogarden";
import fetch from "node-fetch";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Download audio file from URL
async function downloadAudio(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`);
  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
}

// Extract audio clip for time range
async function extractAudioClip(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = endTime - startTime;
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .audioCodec('libmp3lame')
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Clean up word - remove punctuation
function cleanWord(word: string): string {
  return word
    .replace(/[.,!?;:'""\-—–()[\]{}]/g, '') // Remove punctuation
    .trim();
}

// Transcribe audio with Whisper - word level timestamps
async function transcribeAudio(audioPath: string): Promise<Array<{ word: string; start: number; end: number }>> {
  const result = await Echogarden.recognize(audioPath, {
    engine: 'whisper',
    language: 'en',
    whisper: {
      model: 'small',
      temperature: 0.0,
    }
  });

  return (result.wordTimeline?.map((entry: any) => ({
    word: cleanWord(entry.text),
    start: entry.startTime,
    end: entry.endTime
  })) || []).filter(w => w.word.length > 0); // Filter out empty words after cleanup
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { short_id, force } = req.body;

  if (!short_id) {
    return res.status(400).json({ error: 'short_id is required' });
  }

  let fullAudioPath = '';
  let clipAudioPath = '';

  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get short details
    const { data: short, error: shortError } = await supabaseAdmin
      .from('shorts')
      .select('id, start_time, end_time, parent_video_id, word_timestamps')
      .eq('id', short_id)
      .eq('user_id', user.id)
      .single();

    if (shortError || !short) {
      return res.status(404).json({ error: 'Short not found' });
    }

    // Already has captions (skip if force=true)
    if (!force && short.word_timestamps && short.word_timestamps.length > 0) {
      return res.status(200).json({
        success: true,
        word_timestamps: short.word_timestamps,
        cached: true
      });
    }

    // Get parent video for audio_url
    const { data: parentVideo, error: parentError } = await supabaseAdmin
      .from('cut_short_videos')
      .select('audio_url')
      .eq('id', short.parent_video_id)
      .single();

    if (parentError || !parentVideo || !parentVideo.audio_url) {
      return res.status(400).json({ error: 'Parent video audio not found' });
    }

    // Generate captions for ±60s range (so user can adjust timing without regenerating)
    const CAPTION_PADDING = 60; // seconds before and after
    const captionStart = Math.max(0, short.start_time - CAPTION_PADDING);
    const captionEnd = Math.min(parentVideo.duration || short.end_time + CAPTION_PADDING, short.end_time + CAPTION_PADDING);

    console.log(`🎙️ Generating captions for short ${short_id}`);
    console.log(`⏱️ Short range: ${short.start_time}s - ${short.end_time}s`);
    console.log(`⏱️ Caption range (±60s): ${captionStart}s - ${captionEnd}s`);

    // Download full audio
    fullAudioPath = path.join(tmpdir(), `full-audio-${short_id}-${Date.now()}.mp3`);
    console.log(`📥 Downloading audio...`);
    await downloadAudio(parentVideo.audio_url, fullAudioPath);

    // Extract extended clip for caption range (±60s)
    clipAudioPath = path.join(tmpdir(), `clip-audio-${short_id}-${Date.now()}.mp3`);
    console.log(`✂️ Extracting extended clip for captions...`);
    await extractAudioClip(fullAudioPath, clipAudioPath, captionStart, captionEnd);

    // Transcribe with Whisper
    console.log(`🎙️ Transcribing with Whisper...`);
    const rawTimestamps = await transcribeAudio(clipAudioPath);
    console.log(`✅ Got ${rawTimestamps.length} words`);

    // Store timestamps with ABSOLUTE times (relative to original video)
    // Frontend will filter and adjust based on current start_time/end_time
    const word_timestamps = rawTimestamps.map(w => ({
      word: w.word,
      start: w.start + captionStart,
      end: w.end + captionStart,
    }));

    // Cleanup
    if (fs.existsSync(fullAudioPath)) fs.unlinkSync(fullAudioPath);
    if (fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);

    // Save timestamps with absolute times
    const { error: updateError } = await supabaseAdmin
      .from('shorts')
      .update({ word_timestamps })
      .eq('id', short_id);

    if (updateError) {
      throw updateError;
    }

    console.log(`✅ Captions saved for short ${short_id} (${word_timestamps.length} words)`);

    return res.status(200).json({
      success: true,
      word_timestamps,
    });

  } catch (err: any) {
    // Cleanup on error
    if (fullAudioPath && fs.existsSync(fullAudioPath)) fs.unlinkSync(fullAudioPath);
    if (clipAudioPath && fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);

    console.error(`❌ Error generating captions: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
