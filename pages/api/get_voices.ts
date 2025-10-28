import type { NextApiRequest, NextApiResponse } from "next";
import fetch from "node-fetch";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log("🎙️ Fetching voices from ElevenLabs public endpoint...");

    // Use public endpoint (no auth required for listing voices)
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
    });

    console.log("Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error response:", errorText);
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    console.log("✅ Successfully fetched", data.voices?.length || 0, "voices");

    // Return voices with labels/features
    const voices = data.voices.map((voice: any) => ({
      id: voice.voice_id,
      name: voice.name,
      preview_url: voice.preview_url,
      labels: voice.labels, // e.g., { accent: "american", age: "young", use_case: "narration" }
    }));

    res.status(200).json({ voices });
  } catch (error: any) {
    console.error("❌ Error fetching voices:", error);
    res.status(500).json({ error: error.message });
  }
}
