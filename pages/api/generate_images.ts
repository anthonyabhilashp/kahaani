import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { JobLogger } from "../../lib/logger";
import { updateStoryMetadata } from "../../lib/updateStoryMetadata";
import { getUserCredits, deductCredits, refundCredits, CREDIT_COSTS } from "../../lib/credits";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { story_id, style, instructions } = req.body;
  if (!story_id) return res.status(400).json({ error: "story_id required" });

  let logger: JobLogger | null = null;

  try {
    logger = new JobLogger(story_id, "generate_images");
    logger.log(`🎨 Starting image generation for story: ${story_id}`);

    // 💳 Credit check: Get user ID from story
    const { data: story, error: storyErr } = await supabaseAdmin
      .from("stories")
      .select("user_id, title")
      .eq("id", story_id)
      .single();

    if (storyErr || !story) {
      throw new Error("Story not found");
    }

    const userId = story.user_id;
    logger.log(`👤 User ID: ${userId}`);

    // 1️⃣ Fetch story scenes first to calculate credit cost
    const { data: scenes, error: sceneErr } = await supabaseAdmin
      .from("scenes")
      .select("id, text, order, image_url")
      .eq("story_id", story_id)
      .order("order", { ascending: true });

    if (sceneErr || !scenes?.length) throw new Error("No scenes found");
    logger.log(`📚 Found ${scenes.length} scenes to generate images for`);

    // 💳 Calculate credits needed: 1 credit per scene
    const creditsNeeded = scenes.length * CREDIT_COSTS.IMAGE_PER_SCENE;
    logger.log(`💳 Credits needed: ${creditsNeeded} (${scenes.length} scenes × ${CREDIT_COSTS.IMAGE_PER_SCENE} credit per image)`);

    // 💳 Check credit balance
    const currentBalance = await getUserCredits(userId);
    logger.log(`💰 Current balance: ${currentBalance} credits`);

    if (currentBalance < creditsNeeded) {
      logger.log(`❌ Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`);
      return res.status(402).json({
        error: `Insufficient credits. You need ${creditsNeeded} credits for ${scenes.length} images (1 per scene), but you only have ${currentBalance}.`,
        required_credits: creditsNeeded,
        current_balance: currentBalance
      });
    }

    // 💳 Deduct credits before starting generation
    const deductResult = await deductCredits(
      userId,
      creditsNeeded,
      'deduction_images',
      `Image generation for ${scenes.length} scenes in story: ${story.title || story_id}`,
      story_id
    );

    if (!deductResult.success) {
      logger.log(`❌ Failed to deduct credits: ${deductResult.error}`);
      return res.status(500).json({ error: deductResult.error });
    }

    logger.log(`✅ Deducted ${creditsNeeded} credits. New balance: ${deductResult.newBalance}`);

    // 1.5️⃣ Extract ALL story elements (characters, environments, props) for reference image
    const finalStyle = style || "cinematic illustration";
    const extraNotes = instructions ? `\nAdditional Instructions: ${instructions}` : "";

    logger.log(`🧠 Step 1: Extracting all story elements (characters, environments, props)...`);
    logger.log(`🎨 Target style: ${finalStyle}`);

    const elementsPrompt = `You are a visual director analyzing a story to create a master reference sheet for AI image generation.

STORY SCENES:
${scenes.map((s, i) => `Scene ${i + 1}: ${s.text}`).join('\n')}

TARGET VISUAL STYLE: ${finalStyle}${extraNotes}

Extract ALL unique elements from this story:
1. CHARACTERS: List every character with detailed physical description (age, height, build, hair, face, clothing, defining features)
2. ENVIRONMENTS: List every location/setting mentioned
3. PROPS/OBJECTS: Important items that appear in the story

Then create visual descriptions for each scene.

Return ONLY valid JSON in this exact format:
{
  "characters": [
    {
      "name": "Character name",
      "description": "Detailed physical description in ${finalStyle} style (age, height, build, hair color, face shape, clothing, body proportions, skin tone, etc.)"
    }
  ],
  "environments": [
    {
      "name": "Environment name",
      "description": "Detailed environment description in ${finalStyle} style"
    }
  ],
  "props": [
    {
      "name": "Prop name",
      "description": "Detailed prop description in ${finalStyle} style"
    }
  ],
  "visual_descriptions": [
    "Detailed visual description for scene 1...",
    "Detailed visual description for scene 2...",
    ...
  ]
}

Return exactly ${scenes.length} visual descriptions in the visual_descriptions array.`;

    const descResp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.SCENE_MODEL || "mistralai/mistral-7b-instruct",
        messages: [{ role: "user", content: elementsPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    const descData = await descResp.json() as any;
    const descRaw = descData?.choices?.[0]?.message?.content || "";

    logger?.log(`📦 Raw elements response (first 500 chars): ${descRaw.substring(0, 500)}`);

    let visualDescriptions: string[] = [];
    let characters: any[] = [];
    let environments: any[] = [];
    let props: any[] = [];

    try {
      const descParsed = JSON.parse(descRaw.replace(/```(?:json)?/g, "").trim());

      // Extract story elements
      characters = descParsed.characters || [];
      environments = descParsed.environments || [];
      props = descParsed.props || [];

      logger.log(`✅ Extracted story elements:`);
      logger.log(`   👥 Characters: ${characters.length}`);
      characters.forEach((c: any) => logger.log(`      - ${c.name}: ${c.description.substring(0, 100)}...`));
      logger.log(`   🌍 Environments: ${environments.length}`);
      environments.forEach((e: any) => logger.log(`      - ${e.name}: ${e.description.substring(0, 100)}...`));
      logger.log(`   🎯 Props: ${props.length}`);
      props.forEach((p: any) => logger.log(`      - ${p.name}: ${p.description.substring(0, 100)}...`));

      const rawDescriptions = descParsed.visual_descriptions || [];
      logger?.log(`📝 Raw descriptions type: ${typeof rawDescriptions}, length: ${rawDescriptions.length}`);

      // Convert to strings (handle both string[] and object[] formats)
      visualDescriptions = rawDescriptions.map((desc: any) => {
        if (typeof desc === 'string') {
          return desc;
        } else if (typeof desc === 'object' && desc !== null) {
          return desc.description || desc.visual_description || desc.text || JSON.stringify(desc);
        }
        return String(desc);
      });

      logger.log(`✅ Generated ${visualDescriptions.length} visual descriptions`);
    } catch (err) {
      logger.error("⚠️ Failed to parse story elements, falling back to scene text");
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

    // 2.5️⃣ Generate master reference image with all story elements
    const provider = process.env.PROVIDER || "openrouter";
    const model = process.env.IMAGE_MODEL || "google/gemini-2.5-flash-image-preview";

    // 🎯 Use same aspect ratio system as video generation
    const aspect = process.env.ASPECT_RATIO || "9:16";
    const videoWidth = parseInt(process.env.VIDEO_WIDTH || "1080");
    const videoHeight = parseInt(process.env.VIDEO_HEIGHT || "1920");

    // 📱 Generate images with EXACT same dimensions as final video
    const imageSize = `${videoWidth}x${videoHeight}`;

    logger.log(`🧠 Using ${provider} model: ${model} (${imageSize}, aspect ${aspect} - matches video dimensions)`);

    // Generate master reference image if we have characters
    let referenceImageUrl: string | null = null;

    if (characters.length > 0) {
      logger.log(`\n🎨 Step 2: Generating master reference image with all story elements...`);

      const referencePrompt = `Create a CHARACTER REFERENCE SHEET in "${finalStyle}" style.

This is a reference sheet showing all characters and key elements for a story. Display each element clearly for reference purposes.

CHARACTERS TO INCLUDE:
${characters.map((c: any, i: number) => `${i + 1}. ${c.name}: ${c.description}`).join('\n')}

${environments.length > 0 ? `\nENVIRONMENTS TO SHOW:
${environments.map((e: any, i: number) => `${i + 1}. ${e.name}: ${e.description}`).join('\n')}` : ''}

${props.length > 0 ? `\nKEY PROPS:
${props.map((p: any, i: number) => `${i + 1}. ${p.name}: ${p.description}`).join('\n')}` : ''}

STYLE: ${finalStyle}${extraNotes}

REQUIREMENTS:
- Create a clean reference sheet layout showing all ${characters.length} character(s) clearly
- Each character should be shown in full or 3/4 view to establish their design
- Include environment elements and props if space allows
- Use "${finalStyle}" aesthetic consistently
- This is a REFERENCE SHEET for maintaining consistency, not a scene from the story
- Professional character design sheet style
- Clear, well-lit, neutral background
- Label each character if possible`;

      try {
        const refResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: referencePrompt }],
            modalities: ["image", "text"],
            image_config: { aspect_ratio: aspect },
          }),
        });

        const refResponseText = await refResp.text();

        if (!refResp.ok) {
          logger?.error(`⚠️ Reference image generation failed: ${refResponseText.substring(0, 300)}`);
          logger?.log(`⚠️ Continuing without reference image...`);
        } else {
          let refData: any;
          try {
            refData = JSON.parse(refResponseText);

            const refChoices = refData?.choices || [];
            for (const choice of refChoices) {
              const imgs = choice?.message?.images ||
                          (Array.isArray(choice?.message?.content)
                            ? choice?.message?.content?.filter((c: any) => c.type === "image" || c.image_url)
                            : []);

              if (imgs && imgs.length > 0) {
                const img = imgs[0];
                referenceImageUrl = img?.image_url?.url || img?.image_url;
                if (referenceImageUrl) break;
              }
            }

            if (referenceImageUrl) {
              logger.log(`✅ Master reference image generated successfully!`);
              logger.log(`📸 Reference image URL: ${referenceImageUrl.substring(0, 100)}...`);
            } else {
              logger.log(`⚠️ No reference image returned, continuing without it...`);
            }
          } catch (parseErr) {
            logger?.error(`⚠️ Failed to parse reference image response`);
          }
        }
      } catch (err: any) {
        logger?.error(`⚠️ Error generating reference image: ${err.message}`);
        logger?.log(`⚠️ Continuing without reference image...`);
      }
    } else {
      logger.log(`⚠️ No characters extracted, skipping reference image generation`);
    }

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

      // Build character reference context
      const characterContext = characters.length > 0 ? `\n\nCHARACTER REFERENCE (maintain these exact designs):
${characters.map((c: any, idx: number) => `${idx + 1}. ${c.name}: ${c.description}`).join('\n')}` : '';

      const scenePrompt = `You are a professional ${finalStyle} illustrator. Create a single high-quality image for this scene.

${referenceImageUrl ? '⚠️ CRITICAL: A REFERENCE IMAGE is provided showing all characters. You MUST match the character designs EXACTLY as shown in the reference image.' : ''}

FULL STORY CONTEXT (for consistency):
${fullStoryContext}${characterContext}

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
${referenceImageUrl ? '- MATCH character appearances EXACTLY from the reference image provided' : '- Maintain consistent character designs and art style with other scenes in the story'}
- Characters should look identical to how they appear ${referenceImageUrl ? 'in the reference image' : 'throughout the story'}
- High quality composition in "${finalStyle}" style
- DO NOT create a grid, montage, or multiple panels

Generate one beautiful image for Scene ${i + 1} in "${finalStyle}" style${referenceImageUrl ? ', matching the reference character designs exactly' : ''}.`;

      // Build messages array with reference image if available
      const messages: any[] = [];

      // Add reference image first if available
      if (referenceImageUrl) {
        messages.push({
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: referenceImageUrl
              }
            },
            {
              type: "text",
              text: "This is the CHARACTER REFERENCE SHEET. Use these exact character designs for the scene below."
            }
          ]
        });
      }

      // Add the scene prompt
      messages.push({
        role: "user",
        content: scenePrompt
      });

      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: messages,
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

    // Save reference image URL and character data to story
    if (referenceImageUrl || characters.length > 0) {
      logger.log(`💾 Saving reference image and character data to story...`);

      const updateData: any = {};

      if (referenceImageUrl) {
        updateData.reference_image_url = referenceImageUrl;
      }

      if (characters.length > 0 || environments.length > 0 || props.length > 0) {
        updateData.story_elements = {
          characters: characters,
          environments: environments,
          props: props
        };
      }

      const { error: storyUpdateErr } = await supabaseAdmin
        .from("stories")
        .update(updateData)
        .eq("id", story_id);

      if (storyUpdateErr) {
        logger.error("⚠️ Failed to save reference data to story", storyUpdateErr);
      } else {
        logger.log(`✅ Reference data saved to story`);
      }
    }

    // Update story metadata (completion status)
    logger.log(`📊 Updating story metadata...`);
    await updateStoryMetadata(story_id);
    logger.log(`✅ Story metadata updated`);

    res.status(200).json({
      story_id,
      updated_scenes: uploads,
      reference_image_url: referenceImageUrl,
      story_elements: { characters, environments, props }
    });

  } catch (err: any) {
    if (logger) logger.error("❌ Error generating images", err);

    // 💳 Auto-refund credits if generation failed
    try {
      // Try to get user ID from story for refund
      const { data: story } = await supabaseAdmin
        .from("stories")
        .select("user_id, title")
        .eq("id", story_id)
        .single();

      if (story && story.user_id) {
        // Get scene count to calculate refund amount
        const { data: storyScenes } = await supabaseAdmin
          .from("scenes")
          .select("id")
          .eq("story_id", story_id);

        const refundAmount = (storyScenes?.length || 0) * CREDIT_COSTS.IMAGE_PER_SCENE;

        logger?.log(`💸 Refunding ${refundAmount} credits due to generation failure...`);
        const refundResult = await refundCredits(
          story.user_id,
          refundAmount,
          `Refund: Image generation failed for story ${story.title || story_id}`,
          story_id
        );

        if (refundResult.success) {
          logger?.log(`✅ Refunded ${refundAmount} credits. New balance: ${refundResult.newBalance}`);
        } else {
          logger?.error(`❌ Failed to refund credits`);
        }
      }
    } catch (refundErr: any) {
      logger?.error(`❌ Error during refund process: ${refundErr.message}`);
    }

    res.status(500).json({ error: err.message || "Image generation failed" });
  }
}
