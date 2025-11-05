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

    // 1.5️⃣ Check if story belongs to a series and get aspect ratio + story reference
    const { data: story, error: storyErr } = await supabaseAdmin
      .from("stories")
      .select("series_id, aspect_ratio, reference_image_url, character_library")
      .eq("id", scene.story_id)
      .single();

    const storyAspectRatio = story?.aspect_ratio || "9:16";
    const storyReference = story?.reference_image_url || null;
    const storyLibrary = story?.character_library || null;
    let seriesReference: string | null = null;
    let characterLibrary: any = null;
    const isSeriesStory = story && story.series_id;
    let hasCharacterConsistency = false;

    if (isSeriesStory) {
      logger?.log(`📺 Story belongs to series: ${story.series_id}`);

      // Load series settings
      const { data: series, error: seriesErr } = await supabaseAdmin
        .from("series")
        .select("has_character_consistency")
        .eq("id", story.series_id)
        .single();

      if (!seriesErr && series) {
        hasCharacterConsistency = series.has_character_consistency !== false; // Default to true if not set

        if (hasCharacterConsistency) {
          // Use this story's own reference and library (already loaded above)
          if (storyReference && storyLibrary) {
            seriesReference = storyReference;
            characterLibrary = storyLibrary;
            logger?.log(`📚 Using story's own reference and library (series consistency enabled):`);
            logger?.log(`   🖼️ Reference image: ${seriesReference ? 'exists' : 'none'}`);
            logger?.log(`   👥 Character library: ${characterLibrary?.characters?.length || 0} characters`);
          } else {
            // Fallback: load from latest story in series (for new stories)
            logger?.log(`🔍 Story has no reference yet, loading from latest story in series...`);
            const { data: latestStory, error: latestErr } = await supabaseAdmin
              .from("stories")
              .select("character_library, reference_image_url")
              .eq("series_id", story.series_id)
              .neq("id", scene.story_id)
              .not("character_library", "is", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!latestErr && latestStory) {
              seriesReference = latestStory.reference_image_url;
              characterLibrary = latestStory.character_library;
              logger?.log(`📚 Loaded from latest story:`);
              logger?.log(`   🖼️ Reference image: ${seriesReference ? 'exists' : 'none'}`);
              logger?.log(`   👥 Character library: ${characterLibrary?.characters?.length || 0} characters`);
            }
          }
        } else {
          logger?.log(`⚠️ Character consistency disabled for this series - treating stories independently`);
        }
      }
    }

    // Fallback hierarchy: series reference > story reference > scene images
    let referenceScenes: any[] = [];
    if (!seriesReference) {
      if (storyReference) {
        logger?.log(`🖼️ Using story reference image for consistency`);
      } else {
        // Last resort: use other scene images from current story
        const { data: allScenes } = await supabaseAdmin
          .from("scenes")
          .select("id, text, order, image_url")
          .eq("story_id", scene.story_id)
          .not("image_url", "is", null)
          .neq("id", scene_id)
          .order("order", { ascending: true });

        referenceScenes = allScenes || [];
        logger?.log(`📸 No reference image - using ${referenceScenes.length} scene images for consistency`);
      }
    }

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

    // 🎯 Use story-specific aspect ratio (NEVER use env ASPECT_RATIO)
    const aspect = storyAspectRatio;
    let videoWidth: number, videoHeight: number;

    // Calculate dimensions based on story's aspect ratio
    switch (aspect) {
      case "16:9":
        videoWidth = 3840;
        videoHeight = 2160;
        break;
      case "1:1":
        videoWidth = 3840;
        videoHeight = 3840;
        break;
      case "9:16":
      default:
        videoWidth = 2160;
        videoHeight = 3840;
        break;
    }

    const imageSize = `${videoWidth}x${videoHeight}`;
    logger?.log(`📐 Story aspect ratio: ${aspect}, using ${imageSize}`);
    logger?.log(`🧠 Using ${provider} model: ${model}`);

    const finalStyle = style || "cinematic illustration";

    // 4️⃣ Build prompt for single scene with series reference or scene images
    let promptText = `You are a professional cinematic illustrator.

CRITICAL: Generate EXACTLY ONE SINGLE IMAGE. Do NOT create multiple images, panels, or a sequence. Just ONE standalone image.

Scene description: ${scene.text}

Style: ${finalStyle}

`;

    // Add reference context based on priority
    if (seriesReference && characterLibrary) {
      // Priority 1: Series reference (cross-episode consistency)
      promptText += `⚠️ SERIES CHARACTER REFERENCE PROVIDED ABOVE:
A reference sheet image is provided showing all characters from this series.

CHARACTER LIBRARY (all characters from this series):
${characterLibrary.characters?.map((c: any, i: number) => `${i + 1}. ${c.name}: ${c.description}`).join('\n') || 'No characters'}

${characterLibrary.environments?.length > 0 ? `\nENVIRONMENTS:
${characterLibrary.environments.map((e: any, i: number) => `${i + 1}. ${e.name}: ${e.description}`).join('\n')}` : ''}

CRITICAL REQUIREMENTS:
- Use the reference sheet image above to maintain EXACT character designs
- Characters must look IDENTICAL to how they appear in the reference
- Match art style, color palette, and visual mood from the reference
- This is ONE scene from a series - maintain visual consistency
- DO NOT recreate the reference sheet - use it as a guide for character appearance

`;
    } else if (storyReference) {
      // Priority 2: Story reference (within-story consistency)
      promptText += `⚠️ STORY CHARACTER REFERENCE PROVIDED ABOVE:
A reference sheet image is provided showing all characters from this story.

CRITICAL REQUIREMENTS:
- Use the reference sheet image above to maintain EXACT character designs
- Characters must look IDENTICAL to how they appear in the reference
- Match art style, color palette, and visual mood from the reference
- Maintain visual consistency with other scenes in this story
- DO NOT recreate the reference sheet - use it as a guide for character appearance

`;
    } else if (referenceScenes.length > 0) {
      // Priority 3: Scene images fallback
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
- Use consistent artistic style${seriesReference || storyReference || referenceScenes.length > 0 ? ' matching the reference' : ''}
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

    // Build message content with reference (multimodal)
    const messageContent: any[] = [];

    // Priority 1: Use series reference if available (cross-episode consistency)
    if (seriesReference) {
      logger?.log(`🖼️ Including series reference image for character consistency`);
      messageContent.push({
        type: "image_url",
        image_url: { url: seriesReference }
      });
      messageContent.push({
        type: "text",
        text: "This is the series character reference sheet. Use it to maintain character consistency."
      });
    }
    // Priority 2: Use story reference if available (within-story consistency)
    else if (storyReference) {
      logger?.log(`🖼️ Including story reference image for character consistency`);
      messageContent.push({
        type: "image_url",
        image_url: { url: storyReference }
      });
      messageContent.push({
        type: "text",
        text: "This is the story character reference sheet. Use it to maintain character consistency."
      });
    }
    // Priority 3: Fallback to scene images if no reference exists
    else if (referenceScenes.length > 0) {
      const limitedReferences = referenceScenes.slice(0, 3); // Limit to 3 most recent for API efficiency
      logger?.log(`🖼️ Including ${limitedReferences.length} scene reference images for consistency`);

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
