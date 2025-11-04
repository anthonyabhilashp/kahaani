import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { JobLogger } from "../../lib/logger";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { scene_id, style, instructions } = req.body;
  if (!scene_id) return res.status(400).json({ error: "scene_id required" });

  let logger: JobLogger | null = null;

  try {
    // 1️⃣ Fetch the specific scene
    const { data: scene, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, order, image_url, story_id")
      .eq("id", scene_id)
      .single();

    if (sceneErr || !scene) throw new Error("Scene not found");

    logger = new JobLogger(scene.story_id, "generate_scene_image");
    logger?.log(`🎨 Generating image for scene ${scene.order + 1}: ${scene_id}`);

    // 1.5️⃣ Fetch other scenes with images for consistency reference
    const { data: allScenes, error: allScenesErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, order, image_url")
      .eq("story_id", scene.story_id)
      .not("image_url", "is", null)
      .neq("id", scene_id)
      .order("order", { ascending: true });

    const referenceScenes = allScenes || [];
    logger?.log(`📸 Found ${referenceScenes.length} existing images for consistency reference`);

    // 2️⃣ Clean up old image if exists
    if (scene.image_url) {
      logger?.log(`🧹 Removing old image from storage...`);
      const oldPath = scene.image_url.split("/images/")[1];
      if (oldPath) {
        await supabaseAdmin.storage.from("images").remove([oldPath]);
      }
    }

    // 3️⃣ Model + config setup
    const provider = process.env.PROVIDER || "openrouter";
    const model = process.env.IMAGE_MODEL || "google/gemini-2.5-flash-image-preview";

    const aspect = process.env.ASPECT_RATIO || "9:16";
    const videoWidth = parseInt(process.env.VIDEO_WIDTH || "1080");
    const videoHeight = parseInt(process.env.VIDEO_HEIGHT || "1920");
    const imageSize = `${videoWidth}x${videoHeight}`;

    logger?.log(`🧠 Using ${provider} model: ${model} (${imageSize}, aspect ${aspect})`);

    const finalStyle = style || "cinematic illustration";

    // 4️⃣ Build prompt for single scene with reference images
    let promptText = `You are a professional cinematic illustrator.

CRITICAL: Generate EXACTLY ONE SINGLE IMAGE. Do NOT create multiple images, panels, or a sequence. Just ONE standalone image.

Scene description: ${scene.text}

Style: ${finalStyle}

`;

    // Add reference context if we have existing images
    if (referenceScenes.length > 0) {
      promptText += `IMPORTANT - Visual Consistency:
You have ${referenceScenes.length} reference image(s) from previous scenes in this story (shown above for reference only).
- Maintain EXACT SAME character designs, faces, clothing, and appearance as in the reference images
- Keep CONSISTENT art style, color palette, and visual mood
- Match lighting, composition, and artistic techniques
- DO NOT recreate or include scenes from the reference images - only use them as a style guide

`;
    }

    promptText += `Requirements:
- Generate ONE SINGLE IMAGE ONLY (not multiple images or panels)
- Create a visually compelling image that captures the essence of THIS SPECIFIC scene only
- Use consistent artistic style${referenceScenes.length > 0 ? ' matching the reference images' : ''}
- Match the emotional tone of the description
- High detail and professional quality
- DO NOT create a comic strip, storyboard, or sequence of images
`;

    // Add custom instructions if provided
    if (instructions && instructions.trim()) {
      promptText += `\nAdditional Instructions:\n${instructions.trim()}\n`;
    }

    promptText += `\n\nIMPORTANT: Generate ONLY ONE SINGLE IMAGE that represents THIS scene: "${scene.text}"
Do NOT generate multiple scenes, panels, or images in one. Just one standalone image.`;

    // Build message content with reference images (multimodal)
    const messageContent: any[] = [];

    // Add reference images first (if any)
    if (referenceScenes.length > 0) {
      const limitedReferences = referenceScenes.slice(0, 3); // Limit to 3 most recent for API efficiency
      logger?.log(`🖼️ Including ${limitedReferences.length} reference images for consistency`);

      for (const refScene of limitedReferences) {
        messageContent.push({
          type: "text",
          text: `Reference Image (Scene ${refScene.order + 1}): ${refScene.text}`
        });
        messageContent.push({
          type: "image_url",
          image_url: { url: refScene.image_url }
        });
      }
    }

    // Add the main prompt
    messageContent.push({
      type: "text",
      text: promptText
    });

    // 5️⃣ Generate via model
    logger?.log(`🚀 Requesting ${provider} API for scene ${scene.order + 1}...`);
    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: messageContent }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: aspect },
      }),
    });

    const data: any = await resp.json();
    if (!resp.ok) {
      logger?.error("❌ API error response", data);
      throw new Error(`Image generation failed: ${JSON.stringify(data)}`);
    }

    // 6️⃣ Extract image URL
    const choices = data?.choices || [];
    let imageUrl: string | null = null;

    for (const choice of choices) {
      const imgs = choice?.message?.images ||
                   choice?.message?.content?.filter((c: any) => c.type === "image" || c.image_url);
      if (imgs && imgs.length > 0) {
        const img = imgs[0];
        imageUrl = img?.image_url?.url || img?.image_url;
        if (imageUrl) break;
      }
    }

    if (!imageUrl) throw new Error("No image returned by model");

    logger?.log(`🖼️ Received image from model`);

    // 7️⃣ Save image
    const tmpDir = path.join(process.cwd(), "tmp", scene.story_id);
    fs.mkdirSync(tmpDir, { recursive: true });

    const buffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
    const fileName = `scene-${scene.story_id}-${scene.order + 1}.png`;
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

    // 8️⃣ Update scene with image URL and set image_generated_at timestamp
    const { error: updateErr } = await supabaseAdmin
      .from("scenes")
      .update({
        image_url: publicUrl,
        image_generated_at: new Date().toISOString()
      })
      .eq("id", scene_id);

    if (updateErr) throw updateErr;

    logger?.log(`✅ Updated scene ${scene.order + 1} with image → ${publicUrl}`);
    res.status(200).json({ scene_id, image_url: publicUrl, order: scene.order });

  } catch (err: any) {
    logger?.error("❌ Error generating scene image", err);
    res.status(500).json({ error: err.message || "Image generation failed" });
  }
}
