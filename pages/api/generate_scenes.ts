import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import { JobLogger } from "../../lib/logger";
import { v4 as uuidv4 } from "uuid";

// --- Utility ---
function isLongText(text: string): boolean {
  const sentences = text.split(/[.!?]/).filter((s) => s.trim().length > 0);
  return sentences.length > 2 || text.length > 200;
}

function splitIntoScenes(text: string): { text: string }[] {
  const sentences = text
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.map((s) => ({ text: s }));
}

function cleanJSON(raw: string): string {
  return raw.replace(/```(?:json)?/g, "").trim();
}

// --- Constants ---
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// --- Handler ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt, title, story_id, sceneCount = 5, manualScenes, isManual = false, voice_id, aspect_ratio } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  let logger: JobLogger | null = null;

  try {
    // 🔐 Get authenticated user from session
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    let storyId = story_id || uuidv4();
    logger = new JobLogger(storyId, "generate_scenes");
    logger.log(`👤 User: ${user.email} (${user.id})`);
    logger.log(`🎙️ Voice ID: ${voice_id || '21m00Tcm4TlvDq8ikWAM'}`);
    logger.log(`📐 Aspect Ratio: ${aspect_ratio || '9:16'}`);

    if (story_id) {
      logger.log(`♻️ Overwriting scenes for existing story: ${storyId}`);
      // Delete old scenes
      await supabaseAdmin.from("scenes").delete().eq("story_id", storyId);
      await supabaseAdmin.from("stories").update({
        prompt,
        voice_id: voice_id || '21m00Tcm4TlvDq8ikWAM',
        aspect_ratio: aspect_ratio || '9:16'
      }).eq("id", storyId);
    } else {
      logger.log(`🆕 Creating new story for: "${prompt}"`);
      const { error: storyErr } = await supabaseAdmin
        .from("stories")
        .insert([{
          id: storyId,
          title: title || null,
          prompt,
          status: "processing",
          user_id: user.id,  // 🔑 Link story to authenticated user
          voice_id: voice_id || '21m00Tcm4TlvDq8ikWAM',
          aspect_ratio: aspect_ratio || '9:16'
        }]);
      if (storyErr) throw storyErr;
    }

    let scenes: { text: string }[] = [];

    // Handle manual scenes input
    if (isManual && manualScenes && Array.isArray(manualScenes)) {
      logger.log(`📝 Using ${manualScenes.length} manually entered scenes`);
      scenes = manualScenes.map((text: string) => ({ text }));

      // Generate a title for manually entered scenes
      const generatedTitle = title || `Story with ${manualScenes.length} scenes`;
      await supabaseAdmin
        .from("stories")
        .update({ title: generatedTitle })
        .eq("id", storyId);
    } else {

      if (isLongText(prompt)) {
        logger.log("📖 Long story detected — splitting into sentences...");
        scenes = splitIntoScenes(prompt);
      } else {
        const SCENE_MODEL = process.env.SCENE_MODEL || "mistralai/mistral-7b-instruct";
        const PROVIDER = process.env.PROVIDER || "openrouter";
        logger.log(`🧠 Generating ${sceneCount} scenes with ${SCENE_MODEL} (${PROVIDER})...`);

        const storyPrompt = `
You are a JSON generator. Break the following story idea into exactly ${sceneCount} short, visual, and ENGAGING scenes with a catchy title.

RULES:
- Each scene must be ONLY 1-2 sentences maximum
- Make scenes ENGAGING: use vivid action verbs, sensory details, emotion, and drama
- Use varied sentence types: statements, exclamations (!), questions (?)
- Use proper punctuation: periods, commas, exclamation marks, question marks
- Write complete sentences that sound exciting when read aloud
- Use commas for natural pauses in longer sentences
- Create visual, cinematic moments that capture the imagination
- IMPORTANT: The LAST scene must provide a satisfying conclusion with a definitive ending tone (use words like "finally", "at last", "and so")

Examples of engaging vs boring:
- Boring: "The hero went to the castle."
- Engaging: "The hero charged toward the dark castle, sword gleaming in the moonlight!"

For each scene, provide a vivid, engaging narrative description.

Return ONLY valid JSON in this exact format:
{
  "title": "A catchy title for the story",
  "scenes": [
    {
      "text": "One or two exciting, well-punctuated sentences describing what happens."
    }
  ]
}

Story: ${prompt}
        `;

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SCENE_MODEL,
          messages: [{ role: "user", content: storyPrompt }],
          response_format: { type: "json_object" },
        }),
      });

      const data = await response.json() as any;
      const raw = data?.choices?.[0]?.message?.content || "";
      const clean = cleanJSON(raw);

      try {
        const parsed = JSON.parse(clean);
        scenes = parsed.scenes || [];
        
        // Update story title if generated
        if (parsed.title && !story_id) {
          await supabaseAdmin
            .from("stories")
            .update({ title: parsed.title })
            .eq("id", storyId);
          logger.log(`📝 Generated title: "${parsed.title}"`);
        }
      } catch {
        logger.error("⚠️ Model returned invalid JSON, fallback to single scene");
        scenes = [{ text: prompt }];
      }
      }
    }

    logger.log(`✅ Generated ${scenes.length} scenes`);

    const sceneRecords = scenes.map((s, i) => ({
      story_id: storyId,
      order: i + 1,
      text: s.text,
    }));

    const { error: insertErr } = await supabaseAdmin.from("scenes").insert(sceneRecords);
    if (insertErr) throw insertErr;

    await supabaseAdmin.from("stories").update({ status: "ready" }).eq("id", storyId);

    logger.log(`📚 Saved ${scenes.length} scenes for story ${storyId}`);
    res.status(200).json({ story_id: storyId, scenes });
  } catch (err: any) {
    if (logger) logger.error("❌ Error generating scenes", err);
    res.status(500).json({ error: err.message });
  }
}
