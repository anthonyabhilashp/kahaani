import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import * as Echogarden from "echogarden";
import { spawn } from "child_process";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Helper to transcribe audio with word timestamps
async function transcribeAudio(audioPath: string): Promise<{
  text: string;
  word_timestamps: Array<{ word: string; start: number; end: number }>;
}> {
  const recognitionResult = await Echogarden.recognize(audioPath, {
    engine: 'whisper',
    language: 'en',
    whisper: {
      model: 'small',  // Better accuracy for captions
      temperature: 0.0,
    }
  });

  const word_timestamps = recognitionResult.wordTimeline?.map((entry: any) => ({
    word: entry.text,
    start: entry.startTime,
    end: entry.endTime
  })) || [];

  return {
    text: recognitionResult.transcript || '',
    word_timestamps
  };
}

// Helper to download YouTube audio for a specific time range
async function downloadYouTubeAudioClip(
  url: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = endTime - startTime;

    // First download full audio, then extract clip
    const tempFullAudio = path.join(tmpdir(), `yt-full-${Date.now()}.mp3`);

    const args = [
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x', '--audio-format', 'mp3',
      '-o', tempFullAudio,
      url
    ];

    const process = spawn('yt-dlp', args);
    let stderr = '';
    process.stderr.on('data', (data) => { stderr += data.toString(); });

    process.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed: ${stderr}`));
      }

      // Extract clip using ffmpeg
      ffmpeg(tempFullAudio)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(outputPath)
        .audioCodec('libmp3lame')
        .on('end', () => {
          // Cleanup full audio
          if (fs.existsSync(tempFullAudio)) fs.unlinkSync(tempFullAudio);
          resolve();
        })
        .on('error', (err) => {
          if (fs.existsSync(tempFullAudio)) fs.unlinkSync(tempFullAudio);
          reject(err);
        })
        .run();
    });

    process.on('error', (err) => reject(err));
  });
}

// Helper to extract audio clip from video URL
async function extractAudioClipFromUrl(
  videoUrl: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = endTime - startTime;

    ffmpeg(videoUrl)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .audioCodec('libmp3lame')
      .noVideo()
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { short_id } = req.body;

  if (!short_id) {
    return res.status(400).json({ error: 'short_id is required' });
  }

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
      .select('id, start_time, end_time, parent_video_id')
      .eq('id', short_id)
      .single();

    if (shortError || !short) {
      return res.status(404).json({ error: 'Short not found' });
    }

    // Get parent video for source URL
    const { data: parentVideo, error: parentError } = await supabaseAdmin
      .from('cut_short_videos')
      .select('youtube_url, video_url')
      .eq('id', short.parent_video_id)
      .single();

    if (parentError || !parentVideo) {
      return res.status(404).json({ error: 'Parent video not found' });
    }

    const audioClipPath = path.join(tmpdir(), `short-audio-${short_id}-${Date.now()}.mp3`);

    console.log(`🎙️ Generating captions for short ${short_id} (${short.start_time}s - ${short.end_time}s)`);

    // Extract audio clip for this short's time range
    if (parentVideo.youtube_url) {
      console.log(`📥 Downloading YouTube audio clip...`);
      await downloadYouTubeAudioClip(
        parentVideo.youtube_url,
        audioClipPath,
        short.start_time,
        short.end_time
      );
    } else if (parentVideo.video_url) {
      console.log(`📥 Extracting audio clip from video...`);
      await extractAudioClipFromUrl(
        parentVideo.video_url,
        audioClipPath,
        short.start_time,
        short.end_time
      );
    } else {
      return res.status(400).json({ error: 'No video source found' });
    }

    console.log(`✅ Audio clip extracted`);

    // Transcribe the clip
    console.log(`🎙️ Transcribing with Whisper...`);
    const transcription = await transcribeAudio(audioClipPath);
    console.log(`✅ Transcription done: ${transcription.word_timestamps.length} words`);

    // Cleanup
    if (fs.existsSync(audioClipPath)) fs.unlinkSync(audioClipPath);

    // Save word_timestamps to the short
    const { error: updateError } = await supabaseAdmin
      .from('shorts')
      .update({
        word_timestamps: transcription.word_timestamps,
      })
      .eq('id', short_id);

    if (updateError) {
      console.error(`❌ Failed to save captions: ${updateError.message}`);
      return res.status(500).json({ error: updateError.message });
    }

    console.log(`✅ Captions saved for short ${short_id}`);

    return res.status(200).json({
      success: true,
      word_timestamps: transcription.word_timestamps
    });

  } catch (err: any) {
    console.error(`❌ Error generating captions: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
