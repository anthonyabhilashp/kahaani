import type { NextApiRequest, NextApiResponse } from "next";
import fetch from "node-fetch";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// All 12 image styles
const IMAGE_STYLES = [
  { id: "hyper-realistic", prompt: "hyper realistic photo, 4k, ultra detailed", label: "Hyper Realistic" },
  { id: "cinematic", prompt: "cinematic movie still, dramatic lighting, film grain", label: "Cinematic" },
  { id: "black-and-white", prompt: "black and white photography, film noir, high contrast", label: "Black & White" },
  { id: "anime", prompt: "anime illustration, high quality", label: "Anime" },
  { id: "3d-animation", prompt: "3d pixar style animation, rendered", label: "3D Animation" },
  { id: "cartoon", prompt: "cartoon illustration, bold outlines", label: "Cartoon" },
  { id: "oil-painting", prompt: "oil painting, brushstrokes, classical art", label: "Oil Painting" },
  { id: "watercolor", prompt: "watercolor painting, soft, artistic", label: "Watercolor" },
  { id: "pencil-sketch", prompt: "pencil sketch drawing, detailed shading", label: "Pencil Sketch" },
  { id: "comic-book", prompt: "comic book art style, bold lines, vibrant colors", label: "Comic Book" },
  { id: "pixel-art", prompt: "pixel art, retro 16-bit game style", label: "Pixel Art" },
  { id: "vaporwave", prompt: "vaporwave aesthetic, neon colors, retrowave, cyberpunk", label: "Vaporwave" }
];

// Sample scene prompt
const SAMPLE_SCENE = "A lone tree on a rolling hill under a dramatic cloudy sky at sunset";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🎨 Starting sample image generation for all 12 styles...");

    const IMAGE_MODEL = process.env.IMAGE_MODEL || "google/gemini-2.0-flash-exp:free";
    const VIDEO_WIDTH = parseInt(process.env.VIDEO_WIDTH || "1080");
    const VIDEO_HEIGHT = parseInt(process.env.VIDEO_HEIGHT || "1920");
    const ASPECT_RATIO = process.env.ASPECT_RATIO || "9:16";

    console.log(`📐 Generating images at ${VIDEO_WIDTH}x${VIDEO_HEIGHT} (${ASPECT_RATIO})`);

    const results = [];

    // Generate image for each style
    for (let i = 0; i < IMAGE_STYLES.length; i++) {
      const style = IMAGE_STYLES[i];
      console.log(`\n🎨 [${i + 1}/${IMAGE_STYLES.length}] Generating ${style.label}...`);

      try {
        // Construct full prompt with explicit single image instruction
        const fullPrompt = `Generate ONE SINGLE IMAGE ONLY (not multiple images, not a stack, not a grid).

Scene: ${SAMPLE_SCENE}

Style: ${style.prompt}

CRITICAL: Create ONE STANDALONE IMAGE that fills the entire frame. DO NOT create multiple images, stacked images, tiled grids, or panels.

Aspect ratio: ${ASPECT_RATIO}, ${VIDEO_WIDTH}x${VIDEO_HEIGHT}`;

        console.log(`📝 Prompt: ${fullPrompt}`);

        // Call OpenRouter API (using same pattern as generate_scene_image.ts)
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            messages: [
              {
                role: "user",
                content: fullPrompt,
              },
            ],
            modalities: ["image", "text"],
            image_config: { aspect_ratio: ASPECT_RATIO },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter API error: ${errorText}`);
        }

        const data = await response.json() as any;
        console.log(`📦 OpenRouter response:`, JSON.stringify(data, null, 2).substring(0, 500));

        // Extract image URL using same pattern as generate_scene_image.ts
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

        if (!imageUrl) {
          console.log(`❌ Failed to extract image URL from response`);
          throw new Error(`No image returned by model. Response: ${JSON.stringify(data).substring(0, 300)}`);
        }

        console.log(`🖼️ Generated image URL: ${imageUrl}`);

        // Download the image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        console.log(`📥 Downloaded image (${imageBuffer.length} bytes)`);

        // Upload to Supabase storage (samples bucket)
        const fileName = `sample-${style.id}.png`;
        console.log(`☁️ Uploading to samples bucket as: ${fileName}`);

        // Delete old file if exists
        await supabaseAdmin.storage.from("samples").remove([fileName]);

        // Upload new file
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("samples")
          .upload(fileName, imageBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadErr) {
          throw uploadErr;
        }

        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/samples/${fileName}`;
        console.log(`✅ Uploaded: ${publicUrl}`);

        results.push({
          style_id: style.id,
          label: style.label,
          prompt: style.prompt,
          image_url: publicUrl,
          success: true,
        });

      } catch (styleErr: any) {
        console.error(`❌ Failed to generate ${style.label}:`, styleErr.message);
        results.push({
          style_id: style.id,
          label: style.label,
          prompt: style.prompt,
          error: styleErr.message,
          success: false,
        });
      }

      // Small delay between requests to avoid rate limiting
      if (i < IMAGE_STYLES.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`\n✅ Sample image generation completed: ${successCount}/${IMAGE_STYLES.length} successful`);

    res.status(200).json({
      message: "Sample images generated",
      total: IMAGE_STYLES.length,
      successful: successCount,
      failed: IMAGE_STYLES.length - successCount,
      results,
    });

  } catch (err: any) {
    console.error("❌ Error generating sample images:", err);
    res.status(500).json({ error: err.message });
  }
}
