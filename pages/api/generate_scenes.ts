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
  const { prompt, title, story_id } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  let logger: JobLogger | null = null;

  try {
    let storyId = story_id || uuidv4();
    logger = new JobLogger(storyId, "generate_scenes");

    if (story_id) {
      logger.log(`♻️ Overwriting scenes for existing story: ${storyId}`);
      // Delete old scenes
      await supabaseAdmin.from("scenes").delete().eq("story_id", storyId);
      await supabaseAdmin.from("stories").update({ prompt }).eq("id", storyId);
    } else {
      logger.log(`🆕 Creating new story for: "${prompt}"`);
      const { error: storyErr } = await supabaseAdmin
        .from("stories")
        .insert([{ id: storyId, title: title || null, prompt, status: "processing" }]);
      if (storyErr) throw storyErr;
    }

    let scenes: { text: string }[] = [];

    if (isLongText(prompt)) {
      logger.log("📖 Long story detected — splitting into sentences...");
      scenes = splitIntoScenes(prompt);
    } else {
      const SCENE_MODEL = process.env.SCENE_MODEL || "mistralai/mistral-7b-instruct";
      const PROVIDER = process.env.PROVIDER || "openrouter";
      logger.log(`🧠 Generating scenes with ${SCENE_MODEL} (${PROVIDER})...`);

      const storyPrompt = `
You are a JSON generator. Break the following story idea into 3–6 short, visual scenes and create a catchy title.
Each scene should describe what happens visually in one sentence.
Return ONLY valid JSON in this format:
{"title":"A catchy title for the story","scenes":[{"text":"..."},{"text":"..."}]}

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
