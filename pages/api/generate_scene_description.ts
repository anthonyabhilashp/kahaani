import type { NextApiRequest, NextApiResponse } from "next";
import fetch from "node-fetch";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { narration, style, instructions } = req.body;

  if (!narration) {
    return res.status(400).json({ error: "Narration text is required" });
  }

  try {
    const additionalInstructionsText = instructions ? `\n\nAdditional Instructions: ${instructions}` : '';

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [{
          role: "user",
          content: `You are a visual director. Convert this narration into a detailed visual scene description for image generation.

Narration: "${narration}"

Visual Style: ${style || "cinematic illustration"}${additionalInstructionsText}

Create a detailed visual description (2-3 sentences) that describes what should be shown in the image. Focus on:
- Visual elements, setting, composition
- Character appearance and actions
- Lighting, mood, atmosphere
- Camera angle and framing
${instructions ? `- IMPORTANT: Follow these additional instructions: ${instructions}` : ''}

Return ONLY the visual description, no JSON, no extra text.`
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    let description = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!description) {
      throw new Error("No description returned from AI");
    }

    // Clean up instruction tags and formatting artifacts
    description = description
      .replace(/<s>/gi, '')
      .replace(/<\/s>/gi, '')
      .replace(/\[B_INST\]/gi, '')
      .replace(/\[\/B_INST\]/gi, '')
      .replace(/\[INST\]/gi, '')
      .replace(/\[\/INST\]/gi, '')
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .trim();

    // Prepend additional instructions if provided
    if (instructions && instructions.trim()) {
      description = `Additional Instructions: ${instructions.trim()}\n\nScene Description: ${description}`;
    }

    return res.status(200).json({ description });
  } catch (err: any) {
    console.error("Error generating scene description:", err);
    return res.status(500).json({ error: err.message || "Failed to generate description" });
  }
}
