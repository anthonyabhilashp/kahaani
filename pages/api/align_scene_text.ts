import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getUserLogger } from "../../lib/userLogger";
import * as Echogarden from "echogarden";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import https from "https";
import http from "http";

// Helper to download file from URL
async function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filePath);

    client.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(filePath);
      reject(err);
    });
  });
}

// Align text with existing audio using Echogarden (free, local)
async function alignTextWithAudio(audioUrl: string, text: string): Promise<Array<{ word: string; start: number; end: number }>> {
  let tempAudioPath: string | null = null;

  try {
    // Download audio to temp file
    tempAudioPath = path.join(tmpdir(), `align-${Date.now()}.mp3`);
    await downloadFile(audioUrl, tempAudioPath);

    // Use Echogarden to align text with audio
    const alignmentResult = await Echogarden.align(tempAudioPath, text, {
      language: 'en',
    });

    // Extract word timestamps from wordTimeline
    const word_timestamps = alignmentResult.wordTimeline?.map((entry: any) => ({
      word: entry.text,
      start: entry.startTime,
      end: entry.endTime
    })) || [];

    return word_timestamps;
  } finally {
    // Cleanup temp file
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 🔐 Authentication check
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Unauthorized - Please log in" });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized - Invalid session" });
  }

  const { story_id, scene_id } = req.body;

  if (!story_id || !scene_id) {
    return res.status(400).json({ error: "story_id and scene_id are required" });
  }

  try {
    // 🔐 Verify user owns the story
    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("user_id")
      .eq("id", story_id)
      .single();

    if (storyError || !story) {
      return res.status(404).json({ error: "Story not found" });
    }

    if (story.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden - You don't own this story" });
    }

    const logger = story?.user_id ? getUserLogger(story.user_id) : null;

    // Fetch scene data
    const { data: scene, error: sceneError } = await supabaseAdmin
      .from("scenes")
      .select("text, audio_url")
      .eq("id", scene_id)
      .single();

    if (sceneError || !scene) {
      return res.status(404).json({ error: "Scene not found" });
    }

    if (!scene.audio_url) {
      return res.status(400).json({ error: "Scene has no audio to align with" });
    }

    if (!scene.text || scene.text.trim().length === 0) {
      return res.status(400).json({ error: "Scene has no text to align" });
    }

    logger?.info(`[${story_id}] 🎵 Starting async alignment for scene ${scene_id}...`);

    // Align text with audio
    const word_timestamps = await alignTextWithAudio(scene.audio_url, scene.text);
    logger?.info(`[${story_id}] ✅ Alignment complete - generated ${word_timestamps.length} word timestamps`);

    // Update scene with new word timestamps
    const { error: updateError } = await supabaseAdmin
      .from("scenes")
      .update({
        word_timestamps,
        last_modified_at: new Date().toISOString()
      })
      .eq("id", scene_id);

    if (updateError) {
      throw new Error(`Failed to update scene: ${updateError.message}`);
    }

    logger?.info(`[${story_id}] ✅ Scene ${scene_id} updated with aligned timestamps`);

    res.status(200).json({
      success: true,
      word_timestamps,
      message: "Text aligned with audio successfully"
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${story_id}] Alignment error:`, error);

    res.status(500).json({
      error: errorMessage
    });
  }
}
