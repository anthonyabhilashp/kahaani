import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { JobLogger } from "../../lib/logger";
import { generateWordByWordASS, type WordTimestamp } from "../../lib/assSubtitles";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// --- Convert hex color to ASS color format ---
function convertHexToASSColor(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // ASS format is &HBBGGRR (reversed RGB)
  if (hex.length === 6) {
    const r = hex.substring(0, 2);
    const g = hex.substring(2, 4);
    const b = hex.substring(4, 6);
    return `&H${b}${g}${r}`;
  }

  // Default white if invalid
  return '&HFFFFFF';
}

// --- Safe ffprobe helper ---
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        console.warn("⚠️ ffprobe failed, using default 30s duration", err);
        return resolve(30);
      }
      const duration = data?.format?.duration || 0;
      resolve(duration > 1 ? duration : 30); // fallback to 30s if weird
    });
  });
}

// --- Generate SRT subtitle file ---
function generateSRTFile(
  scenes: Array<{ text: string; duration: number }>,
  outputPath: string
): void {
  let currentTime = 0;
  const srtContent = scenes.map((scene, index) => {
    const startTime = currentTime;
    const endTime = currentTime + scene.duration;
    currentTime = endTime;

    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const millis = Math.floor((seconds % 1) * 1000);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    };

    return `${index + 1}\n${formatTime(startTime)} --> ${formatTime(endTime)}\n${scene.text}\n`;
  }).join('\n');

  fs.writeFileSync(outputPath, srtContent, 'utf-8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, aspect_ratio, captions } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_video");
    logger.log(`🎬 Starting video generation for story: ${story_id} with aspect ratio: ${aspect_ratio || '9:16'}`);

    const tmpDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1️⃣ Fetch scenes with images, audio, and word timestamps
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, order, text, image_url, audio_url, word_timestamps")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found for this story");
    logger.log(`📚 Found ${scenes.length} scenes`);

    // 2️⃣ Verify images exist in scenes
    const scenesWithImages = scenes.filter(s => s.image_url);
    logger.log(`🖼️ Found ${scenesWithImages.length} scenes with images out of ${scenes.length} total`);
    if (!scenesWithImages.length) throw new Error("No images found for this story");

    // 3️⃣ Download all media files and get audio durations
    const mediaPaths: Array<{
      sceneIndex: number;
      duration: number;
      imagePath?: string;
      audioPath?: string;
    }> = [];

    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index];
      const sceneFiles: any = { sceneIndex: index, duration: 5 }; // Default 5 seconds if no audio

      // Download image
      if (scene.image_url) {
        const imgRes = await fetch(scene.image_url);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const imgPath = path.join(tmpDir, `scene-${index}.png`);
        fs.writeFileSync(imgPath, buf);
        sceneFiles.imagePath = imgPath;
      }

      // Download audio if exists and get its duration
      if (scene.audio_url) {
        const audioRes = await fetch(scene.audio_url);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        const audioPath = path.join(tmpDir, `scene-${index}-audio.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);
        sceneFiles.audioPath = audioPath;

        // Get actual audio duration using ffprobe
        const audioDuration = await getAudioDuration(audioPath);
        sceneFiles.duration = audioDuration;
        logger.log(`🎵 Scene ${index + 1} audio duration: ${audioDuration.toFixed(2)}s`);
      }

      mediaPaths.push(sceneFiles);
    }

    logger.log(`🖼️ Downloaded media for ${mediaPaths.length} scenes`);
    logger.log(`⏱️ Scene timing: ${mediaPaths.map(s => `Scene ${s.sceneIndex + 1}: ${s.duration.toFixed(2)}s`).join(', ')}`);

    // 6️⃣ Clean up old videos for this story
    const { data: oldVideos } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .eq("story_id", story_id);

    if (oldVideos?.length) {
      logger.log(`🧹 Cleaning up ${oldVideos.length} old video(s)...`);
      const paths = oldVideos.map((v) => v.video_url.split("/videos/")[1]);
      if (paths.length) {
        const { error: delErr } = await supabaseAdmin.storage.from("videos").remove(paths);
        if (delErr) logger.error("⚠️ Error deleting old videos", delErr);
      }
      await supabaseAdmin.from("videos").delete().eq("story_id", story_id);
    }

    // 7️⃣ Get video dimensions based on aspect ratio
    const aspectRatioMap: { [key: string]: { width: number; height: number } } = {
      "9:16": { width: 1080, height: 1920 },  // Portrait (mobile/TikTok)
      "16:9": { width: 1920, height: 1080 },  // Landscape (YouTube)
      "1:1": { width: 1080, height: 1080 }    // Square (Instagram)
    };

    const selectedAspect = aspect_ratio || "9:16";
    const dimensions = aspectRatioMap[selectedAspect] || aspectRatioMap["9:16"];
    const width = dimensions.width;
    const height = dimensions.height;

    logger.log(`🎞️ Rendering video at ${width}x${height} (${selectedAspect})`);

    // 8️⃣ Generate individual scene clips with precise timing
    const videoClips: string[] = [];
    const audioClips: string[] = [];
    
    for (const scene of mediaPaths) {
      if (!scene.imagePath) continue; // Skip scenes without images
      
      const clipPath = path.join(tmpDir, `clip-${scene.sceneIndex}.mp4`);
      
      // Create video clip for this scene duration
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(scene.imagePath!)
          .inputOptions(["-loop 1"])  // Loop the image
          .videoCodec("libx264")
          .noAudio()
          .outputOptions([
            "-pix_fmt yuv420p",
            `-vf scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='min(zoom+0.0015,1.1)':s=${width}x${height}`,
            `-t ${scene.duration}`,  // Duration of the clip
          ])
          .save(clipPath)
          .on("end", resolve)
          .on("error", reject);
      });
      
      videoClips.push(`file '${clipPath}'`);
      
      // If scene has audio, add it to audio clips list
      if (scene.audioPath) {
        audioClips.push(scene.audioPath);
      }
    }

    // 9️⃣ Combine all video clips
    const concatTxt = path.join(tmpDir, "video-concat.txt");
    fs.writeFileSync(concatTxt, videoClips.join("\n"));

    const videoOnlyPath = path.join(tmpDir, `video-only-${story_id}.mp4`);

    // If captions are enabled, generate ASS subtitle file with word-by-word animation
    let captionFilter = "";
    if (captions?.enabled) {
      logger.log(`🎨 Generating captions with style: ${captions.style}, position: ${captions.position}`);

      // Collect all word timestamps from all scenes
      const allWordTimestamps: WordTimestamp[] = [];
      let timeOffset = 0;

      for (const scene of mediaPaths) {
        const sceneData = scenes[scene.sceneIndex];
        if (sceneData.word_timestamps && Array.isArray(sceneData.word_timestamps)) {
          // Add timestamps with offset for this scene's position in video
          sceneData.word_timestamps.forEach((wt: any) => {
            allWordTimestamps.push({
              word: wt.word,
              start: wt.start + timeOffset,
              end: wt.end + timeOffset
            });
          });
        }
        timeOffset += scene.duration;
      }

      logger.log(`📝 Collected ${allWordTimestamps.length} word timestamps from ${mediaPaths.length} scenes`);

      // Use word-by-word ASS if we have timestamps, otherwise fallback to simple SRT
      const assPath = path.join(tmpDir, `subtitles-${story_id}.ass`);

      if (allWordTimestamps.length > 0) {
        // Create custom ASS style from caption settings
        const positionFromBottom = captions.positionFromBottom !== undefined ? captions.positionFromBottom : 20;

        // Calculate marginV based on percentage from bottom
        // For 9:16 video (1080x1920), convert percentage to pixels
        // marginV represents distance from bottom edge
        const videoHeight = height; // Use actual video height
        const marginV = Math.round((positionFromBottom / 100) * videoHeight);

        const assStyle: any = {
          name: 'Custom',
          fontName: captions.fontFamily || 'Montserrat',
          fontSize: captions.fontSize || 20,
          primaryColour: convertHexToASSColor(captions.inactiveColor || '#FFFFFF'),
          bold: captions.fontWeight >= 600 ? 1 : 0,
          italic: 0,
          outline: 3,
          shadow: 2,
          alignment: 2, // Bottom center
          marginV: marginV,
        };

        // Generate ASS with word-by-word animation and custom highlight color
        const highlightColor = convertHexToASSColor(captions.activeColor || '#FFEB3B');
        const assContent = generateWordByWordASS(allWordTimestamps, assStyle, highlightColor);
        fs.writeFileSync(assPath, assContent);
        logger.log(`✅ Generated word-by-word ASS subtitles: ${assPath}`);
      } else {
        // Fallback to simple SRT if no word timestamps
        logger.log(`⚠️ No word timestamps available, using simple scene-level captions`);
        const srtPath = path.join(tmpDir, `subtitles-${story_id}.srt`);
        generateSRTFile(
          mediaPaths.map(scene => ({ text: scenes[scene.sceneIndex].text, duration: scene.duration })),
          srtPath
        );
        // Convert SRT to ASS for consistency (will use simple display)
        // For now, just use SRT path
        logger.log(`✅ Generated simple SRT subtitles: ${srtPath}`);
      }

      // Escape the ASS path for FFmpeg
      const escapedAssPath = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\\\:');
      captionFilter = escapedAssPath;

      logger.log(`📝 Caption file ready: ${assPath}`);
    }

    await new Promise<void>((resolve, reject) => {
      const outputOpts = [
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
      ];

      // Add caption filter if enabled (using ASS file)
      if (captionFilter) {
        outputOpts.push(`-vf subtitles='${captionFilter}'`);
      }

      ffmpeg()
        .input(concatTxt)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(outputOpts)
        .save(videoOnlyPath)
        .on("end", resolve)
        .on("error", reject);
    });

    // 🔟 Create final video - video already has correct timing, just add audio track
    const finalVideo = path.join(tmpDir, `final-video-${story_id}.mp4`);

    // Concat all scene audio files into one track
    const hasAudio = mediaPaths.some(s => s.audioPath);

    if (hasAudio) {
      // Create concat file for audio
      const audioConcat = path.join(tmpDir, "audio-concat.txt");
      const audioFiles = mediaPaths
        .map(s => s.audioPath)
        .filter(Boolean)
        .map(p => `file '${p}'`);
      fs.writeFileSync(audioConcat, audioFiles.join("\n"));

      // Concat audio files
      const mergedAudio = path.join(tmpDir, "merged-audio.m4a");
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(audioConcat)
          .inputOptions(["-f concat", "-safe 0"])
          .audioCodec("aac")
          .save(mergedAudio)
          .on("end", resolve)
          .on("error", reject);
      });

      logger.log("🎵 Concatenated all scene audio files");

      // Combine video with concatenated audio
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoOnlyPath)
          .input(mergedAudio)
          .outputOptions([
            "-c:v copy",  // Copy video without re-encoding
            "-c:a aac",
            "-map 0:v:0",
            "-map 1:a:0",
            "-shortest",  // End when shortest stream ends
            "-movflags +faststart"
          ])
          .save(finalVideo)
          .on("start", (cmd: any) => logger?.log(`🚀 FFmpeg merging: ${cmd}`))
          .on("end", () => {
            logger?.log("✅ Final video with audio track created");
            resolve();
          })
          .on("error", (err: any) => {
            logger?.error("❌ FFmpeg failed", err);
            reject(err);
          });
      });
    } else {
      // No audio, just use video as is
      fs.copyFileSync(videoOnlyPath, finalVideo);
      logger.log("✅ Video-only (no audio)");
    }

    // 11️⃣ Upload final video
    const buffer = fs.readFileSync(finalVideo);
    const fileName = `video-${story_id}-${Date.now()}.mp4`;

    const { error: uploadErr } = await supabaseAdmin.storage
    .from("videos")
    .upload(fileName, buffer, {
        contentType: "video/mp4",
        upsert: true,
    });

    if (uploadErr) throw uploadErr;

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;

    // 12️⃣ Save video metadata and mark as valid
    const totalDuration = mediaPaths.reduce((sum, scene) => sum + scene.duration, 0);

    const { error: upsertErr } = await supabaseAdmin
    .from("videos")
    .upsert(
        {
        story_id,
        video_url: publicUrl,
        is_valid: true,  // Mark video as valid
        duration: totalDuration,
        created_at: new Date().toISOString(),
        },
        { onConflict: "story_id" } // ensures one video per story
    );

    if (upsertErr) throw upsertErr;

    logger.log(`☁️ Uploaded video → ${publicUrl} (${totalDuration.toFixed(1)}s total)`);
    res.status(200).json({ story_id, video_url: publicUrl, duration: totalDuration, is_valid: true });
  } catch (err: any) {
    if (logger) logger.error("❌ Error generating video", err);
    res.status(500).json({ error: err.message });
  }
}
