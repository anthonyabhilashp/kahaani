import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { JobLogger } from "../../lib/logger";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, style, instructions } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_images");
    logger.log(`🎨 Starting image generation for story: ${story_id}`);

    // 1️⃣ Fetch story scenes with existing image info
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, order, image_url")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found");
    logger.log(`📚 Found ${scenes.length} scenes to generate images for`);

    // 1.5️⃣ Generate visual descriptions for ALL scenes in one call (for consistency)
    const finalStyle = style || "cinematic illustration";
    const extraNotes = instructions ? `\nAdditional Instructions: ${instructions}` : "";

    logger.log(`🧠 Generating visual descriptions for all ${scenes.length} scenes...`);
    logger.log(`🎨 Target style: ${finalStyle}`);

    const descriptionPrompt = `You are a professional visual director. Given a story broken into ${scenes.length} scenes, create detailed visual descriptions for each scene that will be used for AI image generation.

STORY SCENES:
${scenes.map((s, i) => `Scene ${i + 1}: ${s.text}`).join('\n')}

TARGET VISUAL STYLE: ${finalStyle}${extraNotes}

For each scene, provide a detailed visual description optimized for "${finalStyle}" style that includes:
- Specific character details (age, appearance, clothing, facial features) appropriate for ${finalStyle} style
- Setting details (location, time of day, lighting, weather)
- Mood and atmosphere
- Camera angle and composition
- Visual characteristics and aesthetic qualities that define "${finalStyle}" style

CRITICAL:
- Maintain consistent character descriptions across ALL scenes (same names, ages, physical features, clothing style, body proportions)
- All descriptions must be tailored to achieve authentic "${finalStyle}" visual style

Return ONLY valid JSON in this exact format:
{
  "visual_descriptions": [
    "Detailed visual description for scene 1 in ${finalStyle} style...",
    "Detailed visual description for scene 2 in ${finalStyle} style...",
    ...
  ]
}

Return exactly ${scenes.length} visual descriptions in order.`;

    const descResp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.SCENE_MODEL || "mistralai/mistral-7b-instruct",
        messages: [{ role: "user", content: descriptionPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    const descData = await descResp.json() as any;
    const descRaw = descData?.choices?.[0]?.message?.content || "";

    logger?.log(`📦 Raw description response (first 500 chars): ${descRaw.substring(0, 500)}`);

    let visualDescriptions: string[] = [];
    try {
      const descParsed = JSON.parse(descRaw.replace(/```(?:json)?/g, "").trim());
      const rawDescriptions = descParsed.visual_descriptions || [];

      logger?.log(`📝 Raw descriptions type: ${typeof rawDescriptions}, length: ${rawDescriptions.length}`);

      // Convert to strings (handle both string[] and object[] formats)
      visualDescriptions = rawDescriptions.map((desc: any) => {
        if (typeof desc === 'string') {
          return desc;
        } else if (typeof desc === 'object' && desc !== null) {
          // If it's an object, try to extract the description field or stringify it
          return desc.description || desc.visual_description || desc.text || JSON.stringify(desc);
        }
        return String(desc);
      });

      logger.log(`✅ Generated ${visualDescriptions.length} visual descriptions`);
    } catch (err) {
      logger.error("⚠️ Failed to parse visual descriptions, falling back to scene text");
      visualDescriptions = scenes.map(s => s.text);
    }

    // Ensure we have enough descriptions (pad with text if needed)
    while (visualDescriptions.length < scenes.length) {
      visualDescriptions.push(scenes[visualDescriptions.length].text);
    }

    // Log each scene with its visual description
    logger?.log(`\n📋 Scene → Visual Description Mapping:`);
    scenes.forEach((scene, i) => {
      logger?.log(`\n🎬 Scene ${i + 1}:`);
      logger?.log(`   Text: "${scene.text}"`);
      logger?.log(`   Visual Description: "${visualDescriptions[i]}"`);
    });

    // 2️⃣ Clean up old image files from storage if they exist
    const oldImageUrls = scenes.filter(s => s.image_url).map(s => s.image_url);
    if (oldImageUrls.length) {
      logger.log(`🧹 Cleaning up ${oldImageUrls.length} old images from storage...`);
      const paths = oldImageUrls.map((url) => url.split("/images/")[1]);
      if (paths.length) {
        const { error: delErr } = await supabaseAdmin.storage
          .from("images")
          .remove(paths);
        if (delErr) logger.error("⚠️ Error deleting old image files", delErr);
      }
    }

    // 3️⃣ Model + config setup
    const provider = process.env.PROVIDER || "openrouter";
    const model = process.env.IMAGE_MODEL || "google/gemini-2.5-flash-image-preview";
    
    // 🎯 Use same aspect ratio system as video generation
    const aspect = process.env.ASPECT_RATIO || "9:16";
    const videoWidth = parseInt(process.env.VIDEO_WIDTH || "1080");
    const videoHeight = parseInt(process.env.VIDEO_HEIGHT || "1920");
    
    // 📱 Generate images with EXACT same dimensions as final video
    const imageSize = `${videoWidth}x${videoHeight}`;
    
    logger.log(`🧠 Using ${provider} model: ${model} (${imageSize}, aspect ${aspect} - matches video dimensions)`);

    // 4️⃣ Generate images individually (one API call per scene)
    // This ensures we know exactly which image belongs to which scene
    logger.log(`🚀 Generating ${scenes.length} images individually (one per scene)...`);
    logger.log(`📝 Using model: ${model}`);

    // Build the complete story context (used for ALL scenes to maintain continuity)
    const fullStoryContext = scenes.map((scene, i) =>
      `Scene ${i + 1}:
Narrative: ${scene.text}
Visual Description: ${visualDescriptions[i]}`
    ).join('\n\n');

    const images: string[] = [];

    // Generate all scenes in parallel for speed
    logger.log(`⚡ Generating all ${scenes.length} images in parallel...`);

    const generateImage = async (i: number) => {
      const scene = scenes[i];
      const sceneDescription = visualDescriptions[i];
      logger?.log(`📸 Starting image ${i + 1}/${scenes.length} for: "${scene.text.substring(0, 50)}..."`);

      const scenePrompt = `You are a professional ${finalStyle} illustrator. Create a single high-quality image for this scene.

FULL STORY CONTEXT (for consistency):
${fullStoryContext}

CURRENT SCENE TO ILLUSTRATE:
Scene ${i + 1}:
Narrative: ${scene.text}
Visual Description: ${sceneDescription}

🎨 VISUAL STYLE: ${finalStyle}${extraNotes}

STYLE REQUIREMENTS:
- Create this image in authentic "${finalStyle}" style
- Apply visual characteristics and aesthetic qualities that define "${finalStyle}"

🎨 REQUIREMENTS:
- Generate ONE image that represents Scene ${i + 1} above
- Fill the ENTIRE frame (${videoWidth}x${videoHeight}) with this single scene
- Maintain consistent character designs and art style with other scenes in the story
- Characters should look identical to how they appear throughout the story
- High quality composition in "${finalStyle}" style
- DO NOT create a grid, montage, or multiple panels

Generate one beautiful image for Scene ${i + 1} in "${finalStyle}" style.`;

      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: scenePrompt }],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: aspect },
        }),
      });

      const responseText = await resp.text();

      if (!resp.ok) {
        logger?.error(`❌ API error for scene ${i + 1}:`, responseText.substring(0, 300));
        throw new Error(`Image generation failed for scene ${i + 1} (${resp.status})`);
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        logger?.error(`❌ Failed to parse response for scene ${i + 1}`, responseText.substring(0, 300));
        throw new Error(`Invalid JSON response for scene ${i + 1}`);
      }

      // Extract image from response
      const choices = data?.choices || [];
      let imageUrl: string | null = null;

      for (const choice of choices) {
        const imgs = choice?.message?.images ||
                     (Array.isArray(choice?.message?.content)
                       ? choice?.message?.content?.filter((c: any) => c.type === "image" || c.image_url)
                       : []);

        if (imgs && imgs.length > 0) {
          const img = imgs[0];
          imageUrl = img?.image_url?.url || img?.image_url;
          if (imageUrl) break;
        }
      }

      if (!imageUrl) {
        logger?.error(`❌ No image returned for scene ${i + 1}`);
        throw new Error(`No image generated for scene ${i + 1}`);
      }

      logger?.log(`✅ Scene ${i + 1} image generated successfully`);
      return { index: i, imageUrl };
    };

    // Generate all images in parallel
    const imagePromises = scenes.map((_, i) => generateImage(i));
    const results = await Promise.all(imagePromises);

    // Sort by index to maintain scene order
    results.sort((a, b) => a.index - b.index);
    const sortedImages = results.map(r => r.imageUrl);
    images.push(...sortedImages);

    logger.log(`\n🖼️ Successfully generated ${images.length} unique images for ${scenes.length} scenes`);

    // 5️⃣ Save new images
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

      const imageGeneratedAt = new Date().toISOString();

      // 8️⃣ Update scene with image URL and set image_generated_at timestamp
      const { error: updateErr } = await supabaseAdmin
        .from("scenes")
        .update({
          image_url: publicUrl,
          image_generated_at: imageGeneratedAt
        })
        .eq("id", scenes[i].id);

      if (updateErr) throw updateErr;

      uploads.push({
        id: scenes[i].id,
        scene_id: scenes[i].id,
        scene_order: i + 1,
        image_url: publicUrl,
        image_generated_at: imageGeneratedAt
      });
      logger.log(`✅ Updated scene ${i + 1} with image → ${publicUrl}`);
    }

    logger.log(`📸 Updated ${uploads.length} scenes with image URLs`);

    // Update story metadata (completion status)
    logger.log(`📊 Updating story metadata...`);
    await updateStoryMetadata(story_id);
    logger.log(`✅ Story metadata updated`);

    res.status(200).json({ story_id, updated_scenes: uploads });

  } catch (err: any) {
    if (logger) logger.error("❌ Error generating images", err);
    res.status(500).json({ error: err.message || "Image generation failed" });
  }
}
