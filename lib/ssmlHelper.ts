/**
 * Convert plain text to SSML with intelligent pause insertion
 * for better narration flow and timing
 */

export interface SSMLOptions {
  sentencePause?: number; // Pause after sentences (ms)
  endPause?: number; // Pause at the end (ms)
  commaPause?: number; // Pause after commas (ms)
  isLastScene?: boolean; // Is this the last scene in the story?
}

const DEFAULT_OPTIONS: SSMLOptions = {
  sentencePause: 500, // 0.5 second after sentences
  endPause: 800, // 0.8 second at the end
  commaPause: 300, // 0.3 second after commas
  isLastScene: false,
};

/**
 * Convert text to SSML with proper pauses
 */
export function textToSSML(text: string, options: SSMLOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Escape special XML characters
  let ssmlText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Add pauses after sentence endings (., !, ?)
  ssmlText = ssmlText.replace(/([.!?])\s+/g, `$1<break time="${opts.sentencePause}ms"/> `);

  // Add pauses after commas for more natural breathing
  ssmlText = ssmlText.replace(/,\s+/g, `,<break time="${opts.commaPause}ms"/> `);

  // Add pause at the very end for clean scene ending
  // For the last scene, use an even longer pause (1.5s) for a definitive ending
  ssmlText = ssmlText.trim();
  if (!ssmlText.endsWith('/>')) {
    const finalPause = opts.isLastScene ? 1500 : opts.endPause!;
    ssmlText += `<break time="${finalPause}ms"/>`;
  }

  // Wrap in SSML speak tag
  return `<speak>${ssmlText}</speak>`;
}

/**
 * Check if text is already SSML formatted
 */
export function isSSML(text: string): boolean {
  return text.trim().startsWith('<speak>') && text.trim().endsWith('</speak>');
}

/**
 * Strip SSML tags and return plain text
 */
export function stripSSML(ssml: string): string {
  return ssml
    .replace(/<speak>/g, '')
    .replace(/<\/speak>/g, '')
    .replace(/<break[^>]*\/>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}
