import type { NextApiRequest, NextApiResponse } from "next";
import fetch from "node-fetch";

const OPENAI_TTS_API = "https://api.openai.com/v1/audio/speech";

// Short preview text for voice samples
const PREVIEW_TEXT = "Hello! This is a preview of my voice. I can narrate your stories with clarity and emotion.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { voice } = req.query;

  if (!voice || typeof voice !== "string") {
    return res.status(400).json({ error: "Voice parameter is required" });
  }

  try {
    console.log(`🎤 Generating voice preview for: ${voice}`);

    // Generate preview audio with OpenAI TTS
    const ttsRes = await fetch(OPENAI_TTS_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1", // Use regular tts-1 for previews (faster)
        input: PREVIEW_TEXT,
        voice: voice,
        response_format: "mp3",
        speed: 1.0
      }),
    });

    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      console.error(`❌ OpenAI TTS preview error: ${errorText}`);
      return res.status(500).json({ error: "Failed to generate voice preview" });
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // Return audio with proper headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.status(200).send(audioBuffer);

    console.log(`✅ Voice preview generated successfully for: ${voice}`);
  } catch (error: any) {
    console.error("❌ Error generating voice preview:", error);
    res.status(500).json({ error: error.message });
  }
}
