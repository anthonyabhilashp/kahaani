import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import { JobLogger } from "../../lib/logger";
import { v4 as uuidv4 } from "uuid";
import { calculateSceneDuration } from "../../lib/utils";
import { checkRateLimit, RateLimits } from "../../lib/rateLimit";

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

// Generate synthetic word timestamps for text-based scenes (no audio)
function generateWordTimestamps(text: string): Array<{ word: string; start: number; end: number }> {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordsPerSecond = 2; // Reading speed (same as duration calculation)
  const wordDuration = 1 / wordsPerSecond;

  return words.map((word, i) => ({
    word: word,
    start: i * wordDuration,
    end: (i + 1) * wordDuration
  }));
}

// --- Constants ---
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// --- Handler ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt, title, story_id, sceneCount = 5, manualScenes, isManual = false, voice_id, aspect_ratio, isBlank = false } = req.body;
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

    // ⏱️ Rate limiting - prevent abuse
    const rateLimit = checkRateLimit(user.id, RateLimits.STORY_GENERATION);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      return res.status(429).json({
        error: "Too many requests. Please wait before creating another story.",
        retry_after: retryAfter
      });
    }

    let storyId = story_id || uuidv4();
    logger = new JobLogger(storyId, "generate_scenes");
    logger.log(`👤 User: ${user.email} (${user.id})`);
    logger.log(`🎙️ Voice ID: ${voice_id || 'alloy'}`);
    logger.log(`📐 Aspect Ratio: ${aspect_ratio || '9:16'}`);
    if (isBlank) {
      logger.log(`📄 Creating blank story`);
    }

    if (story_id) {
      logger.log(`♻️ Overwriting scenes for existing story: ${storyId}`);
      // Delete old scenes
      await supabaseAdmin.from("scenes").delete().eq("story_id", storyId);
      await supabaseAdmin.from("stories").update({
        prompt,
        user_id: user.id,  // 🔑 Ensure user_id is set (fixes old stories without user_id)
        voice_id: voice_id || 'alloy',
        aspect_ratio: aspect_ratio || '9:16'
      }).eq("id", storyId);
    } else {
      logger.log(`🆕 Creating new story for: "${prompt}"`);
      const { error: storyErr } = await supabaseAdmin
        .from("stories")
        .insert([{
          id: storyId,
          title: isBlank ? (title || "MyAwesomeStory") : (title || null),  // Use title for blank stories, or default
          prompt,
          status: isBlank ? "complete" : "processing",  // Blank stories are complete immediately
          user_id: user.id,  // 🔑 Link story to authenticated user
          voice_id: voice_id || 'alloy',
          aspect_ratio: aspect_ratio || '9:16'
        }]);
      if (storyErr) throw storyErr;
    }

    let scenes: { text: string }[] = [];

    // 🔹 Handle blank story - create one empty scene
    if (isBlank) {
      scenes = [{ text: "" }];  // Single empty scene
      logger.log(`✅ Created blank story with 1 empty scene`);
    }

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
    } else if (!isBlank) {  // Skip LLM generation for blank stories

      if (isLongText(prompt)) {
        logger.log("📖 Long story detected — splitting into sentences...");
        scenes = splitIntoScenes(prompt);
      } else {
        const SCENE_MODEL = process.env.SCENE_MODEL || "mistralai/mistral-7b-instruct";
        const PROVIDER = process.env.PROVIDER || "openrouter";
        logger.log(`🧠 Generating ${sceneCount} scenes with ${SCENE_MODEL} (${PROVIDER})...`);

        const storyPrompt = `
You are a JSON generator. Break the following content into exactly ${sceneCount} scenes with a title.

RULES:
- RESPECT THE USER'S INTENT: If they want facts, provide facts. If they want a story, provide a story.
- Match the tone and style to the user's request (educational, narrative, dramatic, informative, etc.)
- Use proper punctuation: periods, commas, exclamation marks, question marks
- Write complete sentences that work well when read aloud
- Make each scene clear and easy to visualize
- The LAST scene should provide closure appropriate to the content type

Return ONLY valid JSON in this exact format:
{
  "title": "A title that matches the content type and topic",
  "scenes": [
    {
      "text": "Clear, well-punctuated sentences."
    }
  ]
}

User request: ${prompt}
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

    logger.log(`✅ ${isBlank ? 'Created' : 'Generated'} ${scenes.length} scene(s)`);

    const sceneRecords = scenes.map((s, i) => ({
      story_id: storyId,
      order: i,  // Use 0-based ordering (consistent with rest of app)
      text: s.text,
      duration: calculateSceneDuration(s.text),  // Auto-calculate based on text length
      word_timestamps: s.text.trim().length > 0 ? generateWordTimestamps(s.text) : [],  // Generate synthetic timestamps immediately
    }));

    logger.log(`📝 Generated word timestamps for ${scenes.length} scene(s)`);

    const { error: insertErr } = await supabaseAdmin.from("scenes").insert(sceneRecords);
    if (insertErr) throw insertErr;

    // Blank stories are already complete, others need to be marked as ready
    await supabaseAdmin.from("stories").update({
      status: isBlank ? "complete" : "ready"
    }).eq("id", storyId);

    logger.log(`📚 Saved ${scenes.length} scenes for story ${storyId}`);
    res.status(200).json({ story_id: storyId, scenes });
  } catch (err: any) {
    if (logger) logger.error("❌ Error generating scenes", err);
    res.status(500).json({ error: err.message });
  }
}
