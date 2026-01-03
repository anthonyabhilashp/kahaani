/**
 * Viral UGC Script Generation Prompt
 *
 * This prompt generates casual, authentic UGC-style scripts for short-form videos
 * following proven TikTok/Instagram/YouTube Shorts patterns.
 */

export function getViralScriptPrompt(topic: string): string {
  return `You are creating a viral UGC advertisement script for short-form content (TikTok, Instagram Reels, YouTube Shorts).

PRODUCT TO ADVERTISE:
${topic}

OBJECTIVE:
Write a 30-45 second UGC ad script that stops people from scrolling and makes them want to buy/try the product. The script must feel authentic, like a real person genuinely recommending something they love, NOT like a traditional advertisement.

WHAT MAKES UGC ADS VIRAL AND CONVERT:
- Opens with something that creates instant curiosity or relatability
- Addresses a real problem or desire the viewer has
- Tells a micro-story (I had X problem, found Y solution, got Z result)
- Uses natural, conversational language like you're talking to a friend
- Creates emotional resonance (excitement, relief, validation, surprise)
- Shows the product as the hero that solved their problem
- Ends with genuine enthusiasm that makes viewers want to buy/try it immediately

YOUR TASK:
Analyze the product/topic above and craft the most compelling script that would make someone:
1. Stop scrolling immediately (first 2 seconds are critical)
2. Feel like "this person gets me"
3. Want to know more about the product
4. Feel excited to try it themselves

TONE & STYLE:
- Speak in first person as a real user sharing their experience
- Use natural speech patterns (contractions, filler words where appropriate)
- Be conversational and authentic, not polished or scripted
- Show genuine emotion and enthusiasm
- Avoid marketing language, corporate speak, or obvious sales tactics
- No emojis, hashtags, or explicit calls-to-action

STRUCTURE YOUR SCRIPT:
Choose the most effective approach for THIS specific product - whether that's:
- Starting with a bold claim or surprising fact
- Opening with a relatable pain point
- Sharing a personal discovery or transformation
- Using a pattern interrupt or unexpected angle
- Creating curiosity through storytelling

The structure should emerge naturally from what would genuinely make someone stop and watch.

OUTPUT FORMAT:
Return your response in this exact format:

TITLE: [A catchy, scroll-stopping title (5-10 words max) that makes people want to watch. Use patterns like "POV:", "Wait until you see...", "I tried X and...", "This changed everything:", etc.]

SCRIPT:
[The raw spoken script - just the words to be said on camera, no formatting or labels]

Example:
TITLE: POV: I found the perfect morning routine hack

SCRIPT:
Okay so I used to wake up exhausted every single day. Like I'd hit snooze five times and still feel like a zombie. Then I discovered this app...`;
}

/**
 * Estimate duration of text when spoken casually
 * @param text Script text
 * @returns Estimated duration in seconds
 */
export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  // Casual speaking: ~2 words per second (slower than formal narration)
  return words * 0.5;
}

/**
 * Split script text into natural scene breaks
 * Groups sentences into ~5-7 second chunks
 * @param scriptText Full script text from LLM
 * @returns Array of scenes with text and duration
 */
export function splitIntoScenes(scriptText: string): Array<{ text: string; duration: number }> {
  // Split into sentences
  const sentences = scriptText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const scenes: Array<{ text: string; duration: number }> = [];
  let currentChunk: string[] = [];
  let currentDuration = 0;

  for (const sentence of sentences) {
    const sentenceDuration = estimateDuration(sentence);

    // If adding this sentence would exceed 7 seconds and we have content, create a scene
    if (currentDuration + sentenceDuration > 7 && currentChunk.length > 0) {
      scenes.push({
        text: currentChunk.join('. ') + '.',
        duration: parseFloat(currentDuration.toFixed(1))
      });
      currentChunk = [sentence];
      currentDuration = sentenceDuration;
    } else {
      currentChunk.push(sentence);
      currentDuration += sentenceDuration;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    scenes.push({
      text: currentChunk.join('. ') + '.',
      duration: parseFloat(currentDuration.toFixed(1))
    });
  }

  return scenes;
}

/**
 * Generate a title from the script text
 * Extracts first compelling phrase or generates from topic
 * @param scriptText Full script text
 * @param topic Original topic input
 * @returns Short title (5-7 words)
 */
export function generateTitle(scriptText: string, topic: string): string {
  // Try to extract first sentence as title
  const firstSentence = scriptText.split(/[.!?]/)[0].trim();

  if (firstSentence.length > 0 && firstSentence.length < 60) {
    return firstSentence;
  }

  // Fallback to topic (truncated if needed)
  return topic.length > 60 ? topic.substring(0, 57) + '...' : topic;
}
