import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { JobLogger } from "../../lib/logger";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Helper function to extract character details for consistency
function extractCharacterInfo(text: string): string {
  const characters = [];
  
  // Look for character descriptions
  if (/\b(young\s+)?boy\b/i.test(text)) {
    characters.push("- Main character: Young boy (consistent age, hair, clothing throughout)");
  }
  if (/\b(young\s+)?girl\b/i.test(text)) {
    characters.push("- Main character: Young girl (consistent age, hair, clothing throughout)");
  }
  if (/\bman\b/i.test(text)) {
    characters.push("- Character: Adult man (consistent appearance)");
  }
  if (/\bwoman\b/i.test(text)) {
    characters.push("- Character: Adult woman (consistent appearance)");
  }
  
  return characters.join('\n');
}

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

    const finalStyle = style || "cinematic illustration";
    const extraNotes = instructions ? `\nInstructions: ${instructions}\n` : "";

    // 🎯 Extract character information for consistency
    const allScenesText = scenes.map(s => s.text).join(' ');
    const characterInfo = extractCharacterInfo(allScenesText);

    const characterConsistencyNote = characterInfo ? `
🎭 CHARACTER REFERENCE FOR CONSISTENCY:
${characterInfo}
- MAINTAIN these exact character features in ALL scenes
- Same clothing, hair, facial features, body proportions
- Character must be visually identical across all images
` : "";

    // 4️⃣ Generate ALL images in a single API call with full story context
    logger.log(`🚀 Generating ${scenes.length} images in one batch request...`);
    logger.log(`📝 Using model: ${model}`);

    // Build the complete story context
    const scenesText = scenes.map((s, i) => `Scene ${i + 1}: ${s.text}`).join('\n\n');

    const batchPrompt = `You are a professional cinematic illustrator. Generate ${scenes.length} separate images for this complete story.

FULL STORY:
${scenesText}

Style: ${finalStyle}
${extraNotes}

${characterConsistencyNote}

🚨 CRITICAL REQUIREMENTS:
- Generate ${scenes.length} SEPARATE, INDIVIDUAL images (one for each scene listed above)
- Each image should be a STANDALONE image that fills the ENTIRE frame (${videoWidth}x${videoHeight})
- DO NOT stack, tile, grid, or combine multiple scenes into one image
- DO NOT create a sequence, montage, storyboard, or comic-style layout
- Each image represents ONLY its corresponding scene
- Maintain consistent character designs, art style, and color palette across ALL images
- Characters should look identical in all images (same face, clothing, proportions)
- High quality, cinematic composition for each individual image

Return ${scenes.length} individual images in order.
`;

    logger.log(`📤 Sending batch request for all ${scenes.length} scenes...`);

    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: batchPrompt }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: aspect },
      }),
    });

    const responseText = await resp.text();
    logger.log(`📦 Response status: ${resp.status}`);

    if (!resp.ok) {
      logger.error(`❌ API error:`, responseText.substring(0, 500));
      throw new Error(`Batch image generation failed (${resp.status}): ${responseText.substring(0, 500)}`);
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      logger.error("❌ Failed to parse response as JSON", responseText.substring(0, 500));
      throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
    }

    // Extract ALL images from the response
    const choices = data?.choices || [];
    const images: string[] = [];

    for (const choice of choices) {
      const imgs = choice?.message?.images ||
                   choice?.message?.content?.filter((c: any) => c.type === "image" || c.image_url);

      if (imgs && imgs.length > 0) {
        for (const img of imgs) {
          const imageUrl = img?.image_url?.url || img?.image_url;
          if (imageUrl) {
            images.push(imageUrl);
          }
        }
      }
    }

    logger.log(`📥 Received ${images.length} images from batch generation`);

    if (images.length === 0) {
      throw new Error(`No images returned from batch generation`);
    }

    // If we got fewer images than scenes, pad with the last image
    // If we got more images than scenes, take only what we need
    if (images.length < scenes.length) {
      logger.log(`⚠️ Warning: Expected ${scenes.length} images, got ${images.length}. Padding with last image.`);
      while (images.length < scenes.length) {
        images.push(images[images.length - 1]);
      }
    } else if (images.length > scenes.length) {
      logger.log(`⚠️ Warning: Expected ${scenes.length} images, got ${images.length}. Using first ${scenes.length} images.`);
      images.splice(scenes.length);
    }

    logger.log(`\n🖼️ Successfully prepared ${images.length} images for ${scenes.length} scenes`);

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
      
      // 8️⃣ Update scene with image URL and set image_generated_at timestamp
      const { error: updateErr } = await supabaseAdmin
        .from("scenes")
        .update({
          image_url: publicUrl,
          image_generated_at: new Date().toISOString()
        })
        .eq("id", scenes[i].id);
        
      if (updateErr) throw updateErr;
      
      uploads.push({
        id: scenes[i].id,
        scene_id: scenes[i].id,
        scene_order: i + 1,
        image_url: publicUrl
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
