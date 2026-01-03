import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import fetch from "node-fetch";
import { getUserLogger } from "../../lib/userLogger";
import { v4 as uuidv4 } from "uuid";
import { calculateSceneDuration } from "../../lib/utils";
import { checkRateLimit, RateLimits } from "../../lib/rateLimit";

// --- Utility ---
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

  let logger: any = null;

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

    // Initialize user logger
    logger = getUserLogger(user.id);

    // ⏱️ Rate limiting - prevent abuse
    const rateLimit = checkRateLimit(user.id, RateLimits.STORY_GENERATION);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      if (logger) { logger.warn(`Rate limit exceeded - retry after ${retryAfter}s`); }
      return res.status(429).json({
        error: "Too many requests. Please wait before creating another story.",
        retry_after: retryAfter
      });
    }

    let storyId = story_id || uuidv4();
    if (logger) { logger.info(`[${storyId}] Starting scene generation`); }
    if (logger) { logger.info(`[${storyId}] User: ${user.email}`); }
    if (logger) { logger.info(`[${storyId}] Voice: ${voice_id || 'alloy'}, Aspect: ${aspect_ratio || '9:16'}`); }
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
      const SCENE_MODEL = process.env.SCENE_MODEL || "deepseek/deepseek-r1-0528";
      const PROVIDER = process.env.PROVIDER || "openrouter";
      logger.log(`🧠 Generating ${sceneCount} scenes with ${SCENE_MODEL} (${PROVIDER})...`);

      const storyPrompt = `
You are an expert storyteller and content creator specializing in viral, engaging short-form content (TikTok, Instagram Reels, YouTube Shorts).

USER REQUEST:
${prompt}

YOUR TASK:
Create exactly ${sceneCount} highly engaging scenes with a scroll-stopping title. Each scene should captivate viewers and make them want to keep watching.

WHAT MAKES CONTENT VIRAL AND ENGAGING:
- Opens with a HOOK that stops scrolling (surprising fact, bold claim, relatable problem, curiosity gap)
- Creates emotional resonance (excitement, wonder, shock, curiosity, relatability)
- Uses storytelling patterns: setup → tension → payoff
- Each scene builds anticipation for the next
- Ends with impact (twist, revelation, satisfying conclusion, or call-to-thought)
- Uses natural, conversational language that works when spoken aloud
- Includes vivid, visual descriptions that are easy to imagine
- Avoids generic conclusions or preachy morals

CONTENT TYPE GUIDELINES:
- STORIES: Create narrative arc with compelling characters, conflict, and resolution. Make viewers care about what happens next.
- FACTS/EDUCATIONAL: Present each fact as a mini-revelation. Use patterns like "You won't believe...", "Here's why...", "The truth about...". Make learning feel like discovering secrets.
- INFORMATIVE: Transform information into narrative. Use curiosity gaps and progressive reveals.

SCENE STRUCTURE:
- Scene 1: MUST hook immediately (first 2 seconds are critical)
- Middle scenes: Build momentum, raise stakes, deepen intrigue
- Final scene: Deliver satisfying payoff OR thought-provoking conclusion

TITLE GUIDELINES:
- Make it scroll-stopping and shareable
- Use proven patterns: "POV:", "Wait until...", "Nobody talks about...", "The truth about...", "How I...", "Why..."
- Keep it 5-12 words, punchy and intriguing
- Match the content type (story, facts, educational)

WRITING STYLE:
- Write for the EAR not the eye (this will be spoken aloud)
- Use contractions, natural speech patterns
- Include proper punctuation for pacing
- Make every word count - no fluff
- Create vivid mental images

Return ONLY valid JSON in this exact format:
{
  "title": "A scroll-stopping, shareable title (5-12 words)",
  "scenes": [
    {
      "text": "Engaging, visual, conversational scene text."
    }
  ]
}

Remember: Your goal is to create content so engaging that viewers HAVE to watch until the end and want to share it.
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
        if (logger) { logger.error("⚠️ Model returned invalid JSON, fallback to single scene"); }
        scenes = [{ text: prompt }];
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

    // Track analytics event
    await supabaseAdmin.from("analytics_events").insert({
      user_id: user.id,
      event_name: 'story_created',
      event_data: {
        story_id: storyId,
        scene_count: scenes.length,
        is_manual: isManual,
        is_blank: isBlank
      }
    });

    res.status(200).json({ story_id: storyId, scenes });
  } catch (err: any) {
    logger?.error(`❌ Error generating scenes: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: err.message });
  }
}
