/**
 * One-time script to generate voice previews for all OpenAI TTS voices
 * and upload them to Supabase storage.
 *
 * Run with: node scripts/generate-voice-previews.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const OPENAI_TTS_API = "https://api.openai.com/v1/audio/speech";
const PREVIEW_TEXT = "Hello! This is a preview of my voice. I can narrate your stories with clarity and emotion.";

const VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "ash",
  "ballad",
  "coral",
  "sage",
  "verse"
];

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateVoicePreview(voiceId) {
  console.log(`🎤 Generating preview for voice: ${voiceId}...`);

  const response = await fetch(OPENAI_TTS_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: PREVIEW_TEXT,
      voice: voiceId,
      response_format: "mp3",
      speed: 1.0
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error for ${voiceId}: ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  console.log(`✅ Generated ${audioBuffer.length} bytes for ${voiceId}`);

  return audioBuffer;
}

async function uploadToSupabase(voiceId, audioBuffer) {
  const fileName = `voice-preview-${voiceId}.mp3`;

  console.log(`☁️  Uploading ${fileName} to Supabase...`);

  // Delete existing file if it exists
  await supabase.storage.from('samples').remove([fileName]);

  // Upload new file
  const { error } = await supabase.storage
    .from('samples')
    .upload(fileName, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (error) {
    throw new Error(`Supabase upload error for ${voiceId}: ${error.message}`);
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/samples/${fileName}`;
  console.log(`✅ Uploaded to: ${publicUrl}\n`);

  return publicUrl;
}

async function main() {
  console.log("🚀 Starting voice preview generation...\n");
  console.log(`📊 Total voices to generate: ${VOICES.length}`);
  console.log(`💰 Estimated cost: ~$0.002\n`);

  const results = [];

  for (let i = 0; i < VOICES.length; i++) {
    const voiceId = VOICES[i];
    console.log(`[${i + 1}/${VOICES.length}] Processing ${voiceId}...`);

    try {
      // Generate audio
      const audioBuffer = await generateVoicePreview(voiceId);

      // Upload to Supabase
      const publicUrl = await uploadToSupabase(voiceId, audioBuffer);

      results.push({
        voiceId,
        url: publicUrl,
        status: 'success'
      });

    } catch (error) {
      console.error(`❌ Error processing ${voiceId}:`, error.message);
      results.push({
        voiceId,
        error: error.message,
        status: 'failed'
      });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Successful: ${results.filter(r => r.status === 'success').length}/${VOICES.length}`);
  console.log(`❌ Failed: ${results.filter(r => r.status === 'failed').length}/${VOICES.length}`);

  console.log("\n📝 Generated URLs:");
  results.filter(r => r.status === 'success').forEach(r => {
    console.log(`  ${r.voiceId}: ${r.url}`);
  });

  if (results.filter(r => r.status === 'failed').length > 0) {
    console.log("\n❌ Failed voices:");
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  ${r.voiceId}: ${r.error}`);
    });
  }

  console.log("\n✨ Done! Update get_voices.ts with the generated URLs.");
}

main().catch(console.error);
