import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { JobLogger } from "../../lib/logger";

// Constants
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Default voice
const ASPECT_RATIO = "1280:720";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

function ffprobeAsync(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: any, data: ffmpeg.FfprobeData) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  let logger: JobLogger | null = null;

  try {
    // 🪣 1️⃣ Create DB entry
    const { data: job } = await supabaseAdmin
      .from("video_jobs")
      .insert([{ prompt, status: "processing" }])
      .select("*")
      .single();

    const jobId = job.id;
    logger = new JobLogger(`job_${jobId}`);
    logger.log(`🎬 Starting Kahaani generation for: "${prompt}"`);

    const tempDir = path.join(process.cwd(), "tmp", jobId);
    fs.mkdirSync(tempDir, { recursive: true });

    // 🧠 2️⃣ Scene generation (text)
    const SCENE_MODEL = process.env.SCENE_MODEL || "mistralai/mistral-7b-instruct";
    logger.log(`🧠 Generating story scenes with ${SCENE_MODEL} (OpenRouter)...`);

    const storyPrompt = `
You are a JSON generator. Break this story idea into 3–5 short visual scenes.
Each scene should describe what happens visually in one sentence.
Return ONLY valid JSON:
{"scenes":[{"text":"..."},{"text":"..."}]}
Story idea: ${prompt}
`;

    const orResp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SCENE_MODEL,
        messages: [{ role: "user", content: storyPrompt }],
      }),
    });

    const orJson = await orResp.json();
    const rawContent = orJson?.choices?.[0]?.message?.content || "";
    const clean = rawContent
      .replace(/```(?:json)?/g, "")
      .replace(/<s>|<\/s>/g, "")
      .trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    } catch (err) {
      logger.error("⚠️ Could not parse scene JSON, fallback to 1 scene");
      parsed = { scenes: [{ text: prompt }] };
    }

    const scenes = parsed.scenes || [{ text: prompt }];
    logger.log(`✅ Generated ${scenes.length} scenes`);

    // 🖼️ 3️⃣ Image generation (Gemini via OpenRouter)
    const IMAGE_MODEL = process.env.IMAGE_MODEL || "google/gemini-2.5-flash-image-preview";
    const IMAGE_SIZE = process.env.IMAGE_SIZE || "1280x720";

    const imagePrompt = `
Generate ${scenes.length} cinematic frames for the following scenes.
Maintain consistent characters, lighting, and visual style.
Scenes:
${scenes.map((s: any, i: number) => `${i + 1}. ${s.text}`).join("\n")}
`;

    logger.log(`🖼️ Generating images using ${IMAGE_MODEL} (${process.env.PROVIDER})...`);
    const imageResp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
        image_config: { size: IMAGE_SIZE },
      }),
    });

    const imgData = await imageResp.json();
    const images: string[] = [];

    for (const choice of imgData?.choices || []) {
    const content = choice?.message?.content || [];
    const imagesField = choice?.message?.images || [];

    const extractUrl = (url: string) => {
        if (url.startsWith("data:image")) {
        const base64 = url.split(",")[1];
        const filePath = path.join(tempDir, `scene_${images.length + 1}.png`);
        fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
        return filePath;
        }
        return url;
    };

    // 1️⃣ Handle multimodal content array
    if (Array.isArray(content)) {
        for (const c of content) {
        const url = c?.image_url?.url || c?.image_url;
        if (url) images.push(extractUrl(url));
        }
    }

    // 2️⃣ Handle legacy "images" array
    if (Array.isArray(imagesField)) {
        for (const img of imagesField) {
        const url = img?.image_url?.url || img?.url;
        if (url) images.push(extractUrl(url));
        else if (img?.b64_json) {
            const filePath = path.join(tempDir, `scene_${images.length + 1}.png`);
            fs.writeFileSync(filePath, Buffer.from(img.b64_json, "base64"));
            images.push(filePath);
        }
        }
    }
    }

    if (!images.length) {
    logger.error("❌ Gemini returned no usable images", JSON.stringify(imgData, null, 2));
    throw new Error("No usable images from Gemini");
    }

    // ✅ Save or download each image properly
    for (let i = 0; i < scenes.length; i++) {
    const imgSrc = images[i] || images[images.length - 1];
    const imgPath = path.join(tempDir, `scene${i + 1}.png`);

    if (imgSrc.startsWith("http")) {
        // Download from remote
        const buf = Buffer.from(await (await fetch(imgSrc)).arrayBuffer());
        fs.writeFileSync(imgPath, buf);
    } else if (fs.existsSync(imgSrc)) {
        // Already a local file (base64 saved earlier)
        fs.copyFileSync(imgSrc, imgPath);
    } else {
        throw new Error(`Invalid image source: ${imgSrc}`);
    }

    scenes[i].imagePath = imgPath;
    logger.log(`✅ Scene ${i + 1} image saved`);
    }


    // 🔊 4️⃣ Voice & video composition
    const sceneClips: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      logger.log(`🎙️ Narrating Scene ${i + 1}: "${s.text}"`);

      const voiceRes = await fetch(`${ELEVENLABS_API}/${ELEVENLABS_VOICE_ID}`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: s.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.4, similarity_boost: 0.7 },
        }),
      });

      const audioBuf = Buffer.from(await voiceRes.arrayBuffer());
      const audioPath = path.join(tempDir, `scene${i + 1}.mp3`);
      fs.writeFileSync(audioPath, audioBuf);

      const audioInfo = await ffprobeAsync(audioPath);
      const duration = Math.max(4, Math.ceil(audioInfo?.format?.duration || 6));
      s.duration = duration;

      const clipPath = path.join(tempDir, `clip${i + 1}.mp4`);
      logger.log(`🎞️ Creating scene video: Scene ${i + 1} (${duration}s)`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(s.imagePath)
          .loop(duration)
          .input(audioPath)
          .outputOptions([
            "-c:v libx264",
            "-pix_fmt yuv420p",
            "-tune stillimage",
            "-shortest",
            `-t ${duration}`,
          ])
          .save(clipPath)
          .on("end", resolve)
          .on("error", reject);
      });

      sceneClips.push(clipPath);
    }

    // 🎬 5️⃣ Concatenate scenes
    logger.log("🧩 Concatenating all scenes...");
    const concatTxt = path.join(tempDir, "concat.txt");
    fs.writeFileSync(concatTxt, sceneClips.map((c) => `file '${c}'`).join("\n"));

    const finalVideo = path.join(tempDir, "kahaani_final.mp4");
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatTxt)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(["-c copy"])
        .save(finalVideo)
        .on("end", resolve)
        .on("error", reject);
    });

    // ☁️ 6️⃣ Upload final video
    logger.log("☁️ Uploading to Supabase...");
    const buffer = fs.readFileSync(finalVideo);
    const fileName = `video-${jobId}.mp4`;

    const { error } = await supabaseAdmin.storage
      .from("videos")
      .upload(fileName, buffer, { contentType: "video/mp4", upsert: true });
    if (error) throw error;

    const videoUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;
    await supabaseAdmin.from("video_jobs").update({ status: "done", video_url: videoUrl }).eq("id", jobId);

    logger.log(`✅ Done! Video ready: ${videoUrl}`);
    res.json({ jobId, videoUrl });
  } catch (err: any) {
    if (logger) logger.error("❌ Error during generation", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
