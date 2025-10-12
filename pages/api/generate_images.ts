import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { JobLogger } from "../../lib/logger";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, style, instructions } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_images");
    logger.log(`🎨 Starting image generation for story: ${story_id}`);

    // 1️⃣ Fetch story scenes
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("text, order")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found");

    // 2️⃣ Clean up old images from Supabase (DB + Storage)
    const { data: oldImages, error: fetchErr } = await supabaseAdmin
      .from("images")
      .select("image_url")
      .eq("story_id", story_id);

    if (fetchErr) throw fetchErr;

    if (oldImages?.length) {
      logger.log(`🧹 Cleaning up ${oldImages.length} old images from Supabase...`);
      const paths = oldImages.map((img) => img.image_url.split("/images/")[1]);
      if (paths.length) {
        const { error: delErr } = await supabaseAdmin.storage
          .from("images")
          .remove(paths);
        if (delErr) logger.error("⚠️ Error deleting old image files", delErr);
      }

      await supabaseAdmin.from("images").delete().eq("story_id", story_id);
      logger.log("🧾 Old image records removed from database");
    }

    // 3️⃣ Model + config setup
    const provider = process.env.PROVIDER || "openrouter";
    const model = process.env.IMAGE_MODEL || "google/gemini-2.5-flash-image-preview";
    const aspect = process.env.IMAGE_ASPECT_RATIO || "16:9";

    logger.log(`🧠 Using ${provider} model: ${model} (aspect ${aspect})`);

    const finalStyle = style || "cinematic illustration";
    const extraNotes = instructions ? `\nInstructions: ${instructions}\n` : "";

    // 4️⃣ Build prompt
    const prompt = `
You are a cinematic illustrator. Generate exactly ${scenes.length} distinct images — 
one per scene — for the following story.

Each image should represent the visual description of that scene,
while keeping characters, art style, environment, and lighting consistent throughout all images.

Style: ${finalStyle}.
${extraNotes}

Scenes:
${scenes.map((s, i) => `${i + 1}. ${s.text}`).join("\n\n")}

Return multiple images (one for each scene, in the same order).
Each image must correspond to the matching numbered scene.
`;

    // 5️⃣ Generate via model
    logger.log(`🚀 Requesting ${provider} API...`);
    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: aspect },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      logger.error("❌ API error response", data);
      throw new Error(`Image generation failed: ${JSON.stringify(data)}`);
    }

    // 6️⃣ Extract image URLs
    const images: string[] = [];
    const choices = data?.choices || [];

    for (const choice of choices) {
      const imgs = choice?.message?.images ||
                   choice?.message?.content?.filter((c: any) => c.type === "image" || c.image_url);
      if (imgs) {
        for (const img of imgs) {
          const url = img?.image_url?.url || img?.image_url;
          if (url) images.push(url);
        }
      }
    }

    if (!images.length) throw new Error("No images returned by model");

    logger.log(`🖼️ Received ${images.length} images`);

    // 7️⃣ Save new images
    const tmpDir = path.join(process.cwd(), "tmp", story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    const uploads: any[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const imgUrl = images[i] || images[images.length - 1];
      const buffer = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
      const fileName = `scene-${story_id}-${i + 1}.png`;
      const filePath = path.join(tmpDir, fileName);
      fs.writeFileSync(filePath, buffer);

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("images")
        .upload(fileName, buffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/${fileName}`;
      uploads.push({ story_id, scene_order: i + 1, image_url: publicUrl });
      logger.log(`✅ Uploaded scene ${i + 1} → ${publicUrl}`);
    }

    // 8️⃣ Insert new records
    const { error: insertErr } = await supabaseAdmin.from("images").insert(uploads);
    if (insertErr) throw insertErr;

    logger.log(`📸 Stored ${uploads.length} new image records in DB`);
    res.status(200).json({ story_id, images: uploads });

  } catch (err: any) {
    if (logger) logger.error("❌ Error generating images", err);
    res.status(500).json({ error: err.message || "Image generation failed" });
  }
}
