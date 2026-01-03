import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import fetch from "node-fetch";
import { getUserLogger } from "../../../lib/userLogger";
import { v4 as uuidv4 } from "uuid";
import { checkRateLimit, RateLimits } from "../../../lib/rateLimit";
import { deductCredits } from "../../../lib/credits";
import { getViralScriptPrompt, splitIntoScenes, generateTitle } from "../../../lib/viralScriptPrompt";
import { UGC_DEFAULTS } from "../../../lib/ugcPresets";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { input_text } = req.body;

  if (!input_text || input_text.trim().length === 0) {
    return res.status(400).json({ error: "input_text is required" });
  }

  let logger: any = null;

  try {
    // 🔐 Get authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    logger = getUserLogger(user.id);
    logger.info(`[UGC] Generating viral script for user: ${user.email}`);

    // ⏱️ Rate limiting
    const rateLimit = checkRateLimit(user.id, RateLimits.STORY_GENERATION);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      logger.warn(`Rate limit exceeded - retry after ${retryAfter}s`);
      return res.status(429).json({
        error: "Too many requests. Please wait before generating another script.",
        retry_after: retryAfter
      });
    }

    // 💳 Check credits BEFORE generation
    const SCRIPT_GENERATION_COST = 1;
    const { data: userCredits } = await supabaseAdmin
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!userCredits || userCredits.balance < SCRIPT_GENERATION_COST) {
      logger.warn(`Insufficient credits. Balance: ${userCredits?.balance || 0}`);
      return res.status(402).json({
        error: "Insufficient credits",
        balance: userCredits?.balance || 0,
        required: SCRIPT_GENERATION_COST
      });
    }

    // 🧠 Generate viral script using Gemini via OpenRouter (10x cheaper than OpenAI)
    const UGC_MODEL = process.env.UGC_SCRIPT_MODEL || "google/gemini-2.5-flash-1219";
    logger.info(`Generating viral script with ${UGC_MODEL} via OpenRouter...`);

    const prompt = getViralScriptPrompt(input_text.trim());

    const llmPayload = {
      model: UGC_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8, // Higher for creative, casual output
      max_tokens: 500
    };

    const llmResponse = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://kahaani.app",
        "X-Title": "Kahaani UGC Generator"
      },
      body: JSON.stringify(llmPayload)
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      logger.error(`OpenRouter API error: ${llmResponse.status} - ${errorText}`);
      throw new Error(`OpenRouter API error: ${llmResponse.status}`);
    }

    const llmData: any = await llmResponse.json();
    const rawResponse = llmData.choices[0]?.message?.content?.trim();

    if (!rawResponse || rawResponse.length === 0) {
      logger.error("LLM returned empty response");
      throw new Error("Failed to generate script - empty response");
    }

    // 🏷️ Parse title and script from LLM response
    let title = generateTitle("", input_text); // Fallback title
    let scriptText = rawResponse;

    // Try to extract TITLE: and SCRIPT: from response
    const titleMatch = rawResponse.match(/TITLE:\s*(.+?)(?:\n|$)/i);
    const scriptMatch = rawResponse.match(/SCRIPT:\s*([\s\S]+)$/i);

    if (titleMatch && scriptMatch) {
      title = titleMatch[1].trim();
      scriptText = scriptMatch[1].trim();
      logger.info(`Parsed title: "${title}"`);
    } else {
      // LLM didn't follow format - use first line as title, rest as script
      const lines = rawResponse.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        title = lines[0].replace(/^(TITLE:|POV:)/i, '').trim();
        scriptText = lines.slice(1).join(' ').trim();
      }
      logger.warn("LLM response didn't match expected format, using fallback parsing");
    }

    logger.info(`Script generated (${scriptText.length} chars)`);

    // 📝 Split script into scenes
    const scenes = splitIntoScenes(scriptText);

    if (scenes.length === 0) {
      logger.error("Script splitting resulted in 0 scenes");
      throw new Error("Failed to split script into scenes");
    }

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
    logger.info(`Split into ${scenes.length} scenes, total duration: ${totalDuration.toFixed(1)}s`);

    // 💾 Create UGC video record
    const ugcVideoId = uuidv4();
    const { error: videoError } = await supabaseAdmin
      .from('ugc_videos')
      .insert({
        id: ugcVideoId,
        user_id: user.id,
        title,
        input_text,
        script_text: scriptText,
        voice_id: UGC_DEFAULTS.voice_id,
        aspect_ratio: UGC_DEFAULTS.aspect_ratio,
        caption_settings: UGC_DEFAULTS.caption_settings,
        duration: totalDuration,
        status: 'draft'
      });

    if (videoError) {
      logger.error(`Failed to create UGC video: ${videoError.message}`);
      throw videoError;
    }

    // 💾 Create UGC clips
    const clipInserts = scenes.map((scene, index) => ({
      id: uuidv4(),
      ugc_video_id: ugcVideoId,
      order_index: index,
      text: scene.text,
      duration: scene.duration,
      media_type: null,
      media_url: null
    }));

    const { error: clipsError } = await supabaseAdmin
      .from('ugc_clips')
      .insert(clipInserts);

    if (clipsError) {
      logger.error(`Failed to create UGC clips: ${clipsError.message}`);
      // Cleanup video record
      await supabaseAdmin.from('ugc_videos').delete().eq('id', ugcVideoId);
      throw clipsError;
    }

    // 💳 Deduct credits AFTER successful generation
    const deductResult = await deductCredits(
      user.id,
      SCRIPT_GENERATION_COST,
      `ugc_script_generation`,
      `UGC Script Generation: ${title}`
    );

    if (!deductResult.success) {
      logger.error(`Credit deduction failed: ${deductResult.error}`);
      // Don't fail the request - script already generated
      // User got the script, but we'll log the credit issue
    }

    logger.info(`✅ UGC script generated successfully. ID: ${ugcVideoId}`);
    logger.info(`Credits deducted: ${SCRIPT_GENERATION_COST}, new balance: ${deductResult.newBalance}`);

    // 📤 Return response
    return res.status(200).json({
      ugc_video_id: ugcVideoId,
      title,
      script_text: scriptText,
      scenes: scenes.map((scene, index) => ({
        order: index,
        text: scene.text,
        duration: scene.duration
      })),
      total_duration: totalDuration,
      credits_deducted: SCRIPT_GENERATION_COST,
      credits_remaining: deductResult.newBalance
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Script generation failed: ${error.message}`);
      logger.error(error.stack);
    }

    return res.status(500).json({
      error: "Failed to generate script",
      details: error.message
    });
  }
}
