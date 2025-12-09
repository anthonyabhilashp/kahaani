import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import { getUserLogger } from "../../../lib/userLogger";
import fetch from "node-fetch";
import { spawn } from "child_process";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Download YouTube video segment using yt-dlp
async function downloadYouTubeSegment(
  url: string,
  outputPath: string,
  start: number,
  end: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
      '--download-sections', `*${start}-${end}`,
      '--force-keyframes-at-cuts',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      url
    ];

    console.log(`📥 Downloading YouTube segment: ${start}s - ${end}s`);
    const process = spawn('yt-dlp', args);

    let stderr = '';
    process.stderr.on('data', (data) => { stderr += data.toString(); });
    process.stdout.on('data', (data) => { console.log('yt-dlp:', data.toString()); });

    process.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log("✅ YouTube segment download completed");
        resolve();
      } else {
        console.error("❌ yt-dlp download failed:", stderr);
        reject(new Error(`Failed to download YouTube segment: ${stderr || 'Unknown error'}`));
      }
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

// Download video from URL
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download video: ${response.statusText}`);

  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
}

// Cut video segment using FFmpeg
async function cutVideoSegment(
  inputPath: string,
  outputPath: string,
  start: number,
  end: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(end - start)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Generate ASS subtitle file from word timestamps
function generateASSSubtitles(
  wordTimestamps: Array<{ word: string; start: number; end: number }>,
  settings: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    positionFromBottom: number;
    activeColor: string;
    inactiveColor: string;
    wordsPerBatch: number;
    textTransform: string;
  }
): string {
  // Convert hex color to ASS format (BGR)
  const hexToASS = (hex: string) => {
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    return `&H00${b}${g}${r}`;
  };

  const activeColor = hexToASS(settings.activeColor);
  const inactiveColor = hexToASS(settings.inactiveColor);

  // Calculate vertical margin (ASS uses pixels from bottom)
  const marginV = Math.round(1080 * (settings.positionFromBottom / 100));

  // Scale font size for 1080p video
  const fontSize = Math.round(settings.fontSize * 3);

  const header = `[Script Info]
Title: Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${settings.fontFamily},${fontSize},${inactiveColor},${inactiveColor},&H00000000,&H80000000,${settings.fontWeight >= 600 ? 1 : 0},0,0,0,100,100,0,0,1,3,2,2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into batches
  const batches: Array<{ words: typeof wordTimestamps; start: number; end: number }> = [];
  for (let i = 0; i < wordTimestamps.length; i += settings.wordsPerBatch) {
    const batchWords = wordTimestamps.slice(i, i + settings.wordsPerBatch);
    batches.push({
      words: batchWords,
      start: batchWords[0].start,
      end: batchWords[batchWords.length - 1].end
    });
  }

  // Format time for ASS (H:MM:SS.CC)
  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  // Apply text transform
  const transformText = (text: string): string => {
    switch (settings.textTransform) {
      case 'uppercase': return text.toUpperCase();
      case 'lowercase': return text.toLowerCase();
      case 'capitalize': return text.charAt(0).toUpperCase() + text.slice(1);
      default: return text;
    }
  };

  // Generate dialogue lines with word-by-word highlighting
  const dialogueLines: string[] = [];

  batches.forEach((batch) => {
    batch.words.forEach((word, wordIndex) => {
      // Build text with current word highlighted
      let text = '';
      batch.words.forEach((w, idx) => {
        const wordText = transformText(w.word);
        if (idx === wordIndex) {
          text += `{\\c${activeColor}}${wordText}{\\c${inactiveColor}} `;
        } else {
          text += `${wordText} `;
        }
      });

      const startTime = formatTime(word.start);
      const endTime = formatTime(word.end);

      dialogueLines.push(`Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text.trim()}`);
    });
  });

  return header + dialogueLines.join('\n');
}

// Burn captions into video using FFmpeg
async function burnCaptions(
  inputPath: string,
  outputPath: string,
  assPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Escape the path for FFmpeg filter
    const escapedAssPath = assPath.replace(/:/g, '\\:').replace(/\\/g, '/');

    ffmpeg(inputPath)
      .outputOptions([
        '-vf', `ass='${escapedAssPath}'`,
        '-c:a', 'copy',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Mix background music into video
async function mixBackgroundMusic(
  inputPath: string,
  outputPath: string,
  musicPath: string,
  volume: number, // 0-100
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const musicVolume = volume / 100; // Convert percentage to 0-1 scale

    ffmpeg()
      .input(inputPath)
      .input(musicPath)
      .complexFilter([
        // Loop background music to match video duration
        `[1:a]aloop=loop=-1:size=2e+09,volume=${musicVolume}[bg]`,
        // Mix original audio with background music
        `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed]`
      ])
      .outputOptions([
        '-map', '0:v',
        '-map', '[mixed]',
        `-t`, `${duration}`,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '256k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
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

  let logger: ReturnType<typeof getUserLogger> | null = null;
  let tempDir = '';

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
    tempDir = path.join(tmpdir(), `cut_${short_id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Get short details including caption and music settings
    const { data: short, error: shortError } = await supabaseAdmin
      .from('shorts')
      .select('id, start_time, end_time, title, parent_video_id, user_id, caption_settings, word_timestamps, music_settings')
      .eq('id', short_id)
      .single();

    if (shortError || !short) {
      return res.status(404).json({ error: 'Short not found' });
    }

    // Verify ownership
    if (short.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to cut this short' });
    }

    // Get parent video (both video_url and youtube_url)
    const { data: parentVideo, error: parentError } = await supabaseAdmin
      .from('cut_short_videos')
      .select('video_url, youtube_url')
      .eq('id', short.parent_video_id)
      .single();

    if (parentError || !parentVideo) {
      return res.status(404).json({ error: 'Parent video not found' });
    }

    if (!parentVideo.video_url && !parentVideo.youtube_url) {
      return res.status(400).json({ error: 'No video source available' });
    }

    const start = short.start_time;
    const end = short.end_time;
    const duration = end - start;

    logger.info(`✂️ Cutting short: ${start.toFixed(1)}s - ${end.toFixed(1)}s (${duration.toFixed(1)}s)`);

    const rawVideoPath = path.join(tempDir, `raw_${short_id}.mp4`);
    const outputPath = path.join(tempDir, `short_${short_id}.mp4`);

    if (parentVideo.youtube_url) {
      // YouTube video - download segment directly with yt-dlp
      logger.info(`📥 Downloading YouTube segment...`);
      await downloadYouTubeSegment(parentVideo.youtube_url, rawVideoPath, start, end);
    } else if (parentVideo.video_url) {
      // Uploaded video - download full and cut with FFmpeg
      logger.info(`📥 Downloading uploaded video...`);
      const inputPath = path.join(tempDir, 'input.mp4');
      await downloadVideo(parentVideo.video_url, inputPath);

      logger.info(`✂️ Cutting video segment...`);
      await cutVideoSegment(inputPath, rawVideoPath, start, end);

      // Cleanup input file
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }

    // Verify raw video exists
    if (!fs.existsSync(rawVideoPath)) {
      throw new Error('Failed to generate short video');
    }

    // Check if captions should be burned in
    const captionSettings = short.caption_settings as any;
    const rawWordTimestamps = short.word_timestamps as Array<{ word: string; start: number; end: number }> | null;

    // Filter timestamps to current short range and make relative to clip start (0)
    // word_timestamps are stored with ABSOLUTE times (relative to original video)
    const wordTimestamps = rawWordTimestamps
      ?.filter(w => w.start >= start && w.start < end)
      .map(w => ({
        word: w.word,
        start: w.start - start,
        end: w.end - start,
      })) || null;

    // Use an intermediate path for the video after captions
    let videoAfterCaptions = outputPath;

    if (captionSettings?.enabled && wordTimestamps && wordTimestamps.length > 0) {
      logger.info(`📝 Burning captions (${wordTimestamps.length} words from ${rawWordTimestamps?.length || 0} total)...`);

      // Generate ASS subtitle file
      const assContent = generateASSSubtitles(wordTimestamps, {
        fontFamily: captionSettings.fontFamily || 'Montserrat',
        fontSize: captionSettings.fontSize || 18,
        fontWeight: captionSettings.fontWeight || 600,
        positionFromBottom: captionSettings.positionFromBottom || 20,
        activeColor: captionSettings.activeColor || '#02f7f3',
        inactiveColor: captionSettings.inactiveColor || '#FFFFFF',
        wordsPerBatch: captionSettings.wordsPerBatch || 3,
        textTransform: captionSettings.textTransform || 'none',
      });

      const assPath = path.join(tempDir, 'captions.ass');
      fs.writeFileSync(assPath, assContent);

      // Burn captions into video
      const captionedVideoPath = path.join(tempDir, `captioned_${short_id}.mp4`);
      await burnCaptions(rawVideoPath, captionedVideoPath, assPath);
      videoAfterCaptions = captionedVideoPath;

      // Cleanup
      if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
      if (fs.existsSync(rawVideoPath)) fs.unlinkSync(rawVideoPath);
    } else {
      // No captions - use raw video
      videoAfterCaptions = rawVideoPath;
    }

    // Check if background music should be mixed in
    const musicSettings = short.music_settings as { enabled?: boolean; music_id?: string; volume?: number } | null;

    if (musicSettings?.enabled && musicSettings?.music_id && (musicSettings.volume ?? 30) > 0) {
      logger.info(`🎵 Adding background music (${musicSettings.volume ?? 30}% volume)...`);

      // Get music URL from library
      const { data: musicData, error: musicError } = await supabaseAdmin
        .from('background_music_library')
        .select('file_url')
        .eq('id', musicSettings.music_id)
        .single();

      if (musicError || !musicData?.file_url) {
        logger.warn(`⚠️ Failed to get music URL, skipping music mixing`);
        // Just move the video without music
        if (videoAfterCaptions !== outputPath) {
          fs.renameSync(videoAfterCaptions, outputPath);
        }
      } else {
        // Download the music file
        const musicPath = path.join(tempDir, 'background-music.mp3');
        logger.info(`📥 Downloading background music...`);
        await downloadVideo(musicData.file_url, musicPath);

        // Mix music into video
        await mixBackgroundMusic(videoAfterCaptions, outputPath, musicPath, musicSettings.volume ?? 30, duration);

        // Cleanup
        if (fs.existsSync(musicPath)) fs.unlinkSync(musicPath);
        if (videoAfterCaptions !== outputPath && fs.existsSync(videoAfterCaptions)) {
          fs.unlinkSync(videoAfterCaptions);
        }

        logger.info(`✅ Background music mixed successfully`);
      }
    } else {
      // No music - move the video to final output
      if (videoAfterCaptions !== outputPath) {
        fs.renameSync(videoAfterCaptions, outputPath);
      }
    }

    // Verify final output exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Failed to generate final video');
    }

    const fileStats = fs.statSync(outputPath);
    logger.info(`✅ Short generated: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Delete old video from storage if exists
    const { data: existingShort } = await supabaseAdmin
      .from('shorts')
      .select('video_url')
      .eq('id', short_id)
      .single();

    if (existingShort?.video_url) {
      const oldPath = existingShort.video_url.split('/storage/v1/object/public/videos/')[1];
      if (oldPath) {
        logger.info(`🗑️ Deleting old video: ${oldPath}`);
        await supabaseAdmin.storage.from('videos').remove([oldPath]);
      }
    }

    // Upload to Supabase Storage
    const fileName = `${user.id}/short-${short_id}-${Date.now()}.mp4`;
    const fileBuffer = fs.readFileSync(outputPath);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('videos')
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload short: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('videos')
      .getPublicUrl(fileName);

    logger.info(`📤 Uploaded short to: ${publicUrl}`);

    // Update short with video_url
    const { error: updateError } = await supabaseAdmin
      .from('shorts')
      .update({
        video_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', short_id);

    if (updateError) {
      logger.error(`⚠️ Failed to update short in database: ${updateError.message}`);
    }

    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn('Failed to cleanup temp files');
    }

    // Track analytics
    await supabaseAdmin.from("analytics_events").insert({
      user_id: user.id,
      event_name: 'short_cut',
      event_data: {
        parent_video_id: short.parent_video_id,
        short_id: short_id,
        duration,
        source: parentVideo.youtube_url ? 'youtube' : 'upload'
      }
    });

    logger.info(`✅ Short cut complete!`);

    res.status(200).json({
      success: true,
      short_id: short_id,
      video_url: publicUrl,
      duration
    });

  } catch (err: any) {
    if (logger) {
      logger.error(`❌ Error cutting short: ${err.message}`);
    }
    console.error(`❌ Error cutting short: ${err.message}`);

    // Cleanup temp files on error
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    res.status(500).json({ error: err.message });
  }
}
