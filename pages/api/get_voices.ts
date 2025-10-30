import type { NextApiRequest, NextApiResponse } from "next";

// OpenAI TTS voices with preview support (stored in Supabase)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const OPENAI_VOICES = [
  {
    id: "alloy",
    name: "Alloy",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-alloy.mp3`,
    labels: {
      accent: "neutral",
      gender: "neutral",
      description: "Balanced and versatile voice",
      use_case: "General narration"
    }
  },
  {
    id: "echo",
    name: "Echo",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-echo.mp3`,
    labels: {
      accent: "american",
      gender: "male",
      description: "Clear male voice",
      use_case: "Professional narration"
    }
  },
  {
    id: "fable",
    name: "Fable",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-fable.mp3`,
    labels: {
      accent: "british",
      gender: "male",
      description: "Expressive British accent",
      use_case: "Storytelling"
    }
  },
  {
    id: "onyx",
    name: "Onyx",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-onyx.mp3`,
    labels: {
      accent: "american",
      gender: "male",
      description: "Deep, authoritative male voice",
      use_case: "Documentary style"
    }
  },
  {
    id: "nova",
    name: "Nova",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-nova.mp3`,
    labels: {
      accent: "american",
      gender: "female",
      description: "Warm, friendly female voice",
      use_case: "Conversational narration"
    }
  },
  {
    id: "shimmer",
    name: "Shimmer",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-shimmer.mp3`,
    labels: {
      accent: "american",
      gender: "female",
      description: "Soft, gentle female voice",
      use_case: "Calm storytelling"
    }
  },
  {
    id: "ash",
    name: "Ash",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-ash.mp3`,
    labels: {
      accent: "british",
      gender: "neutral",
      description: "Professional British voice",
      use_case: "Business narration"
    }
  },
  {
    id: "coral",
    name: "Coral",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-coral.mp3`,
    labels: {
      accent: "american",
      gender: "female",
      description: "Bright, energetic female voice",
      use_case: "Upbeat content"
    }
  },
  {
    id: "sage",
    name: "Sage",
    preview_url: `${SUPABASE_URL}/storage/v1/object/public/samples/voice-preview-sage.mp3`,
    labels: {
      accent: "american",
      gender: "neutral",
      description: "Wise, measured voice",
      use_case: "Educational content"
    }
  }
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log("🎙️ Returning OpenAI TTS voices...");
    console.log("✅ Successfully loaded", OPENAI_VOICES.length, "OpenAI voices");

    res.status(200).json({ voices: OPENAI_VOICES });
  } catch (error: any) {
    console.error("❌ Error fetching voices:", error);
    res.status(500).json({ error: error.message });
  }
}

// ============================================
// COMMENTED OUT - ElevenLabs (for future use)
// ============================================
// import fetch from "node-fetch";
//
// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   try {
//     console.log("🎙️ Fetching voices from ElevenLabs public endpoint...");
//
//     // Use public endpoint (no auth required for listing voices)
//     const response = await fetch("https://api.elevenlabs.io/v1/voices", {
//       method: "GET",
//     });
//
//     console.log("Response status:", response.status, response.statusText);
//
//     if (!response.ok) {
//       const errorText = await response.text();
//       console.error("ElevenLabs API error response:", errorText);
//       throw new Error(`ElevenLabs API error: ${response.statusText}`);
//     }
//
//     const data: any = await response.json();
//     console.log("✅ Successfully fetched", data.voices?.length || 0, "voices");
//
//     // Return voices with labels/features
//     const voices = data.voices.map((voice: any) => ({
//       id: voice.voice_id,
//       name: voice.name,
//       preview_url: voice.preview_url,
//       labels: voice.labels, // e.g., { accent: "american", age: "young", use_case: "narration" }
//     }));
//
//     res.status(200).json({ voices });
//   } catch (error: any) {
//     console.error("❌ Error fetching voices:", error);
//     res.status(500).json({ error: error.message });
//   }
// }
