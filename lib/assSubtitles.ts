/**
 * ASS Subtitle Generator with Word-by-Word Animation
 *
 * Generates Advanced SubStation Alpha (ASS) subtitle files with word-level timing
 * for karaoke-style caption effects.
 */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface ASSStyle {
  name: string;
  fontName: string;
  fontSize: number;
  primaryColour: string;
  secondaryColour?: string;
  outlineColour?: string;
  backColour?: string;
  bold: number;
  italic: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginV: number;
  marginL?: number;
  marginR?: number;
}

/**
 * Format time in ASS format (H:MM:SS.CC)
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/**
 * Generate ASS subtitle content with word-by-word highlighting
 *
 * Uses transparency tags to reveal words one at a time
 */
export function generateWordByWordASS(
  wordTimestamps: WordTimestamp[],
  style: ASSStyle,
  highlightColor?: string
): string {
  if (!wordTimestamps.length) return '';

  // Build ASS header
  const header = `[Script Info]
Title: Word-by-Word Captions
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${style.name},${style.fontName},${style.fontSize},${style.primaryColour},${style.secondaryColour || style.primaryColour},${style.outlineColour || '&H00000000'},${style.backColour || '&H00000000'},${style.bold},${style.italic},0,0,100,100,0,0,${style.outline > 0 ? 1 : 3},${style.outline},${style.shadow},${style.alignment},${style.marginL || 10},${style.marginR || 10},${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue events with word-by-word highlighting
  // Show full sentence and highlight current word
  const events: string[] = [];
  const totalDuration = wordTimestamps[wordTimestamps.length - 1].end;

  for (let i = 0; i < wordTimestamps.length; i++) {
    const currentWord = wordTimestamps[i];
    const start = formatTime(currentWord.start);
    const end = formatTime(i + 1 < wordTimestamps.length ? wordTimestamps[i + 1].start : totalDuration);

    // Build text with full sentence, highlighting current word
    let text = '';

    for (let j = 0; j < wordTimestamps.length; j++) {
      const word = wordTimestamps[j].word;

      if (j < i) {
        // Past words - normal (already spoken)
        text += word + ' ';
      } else if (j === i) {
        // Current word - highlighted with bold, color, and underline
        if (highlightColor) {
          text += `{\\b1\\c${highlightColor}\\u1}${word}{\\b0\\c${style.primaryColour}\\u0} `;
        } else {
          text += `{\\b1\\u1}${word}{\\b0\\u0} `;
        }
      } else {
        // Future words - dimmed (not yet spoken)
        text += `{\\alpha&H99}${word}{\\alpha&H00} `;
      }
    }

    events.push(`Dialogue: 0,${start},${end},${style.name},,0,0,0,,${text.trim()}`);
  }

  return header + events.join('\n');
}

/**
 * Generate simple SRT subtitle (no word-by-word, just scene-level)
 */
export function generateSimpleSRT(
  scenes: Array<{ text: string; duration: number }>
): string {
  let currentTime = 0;
  const entries: string[] = [];

  scenes.forEach((scene, index) => {
    const startTime = currentTime;
    const endTime = currentTime + scene.duration;
    currentTime = endTime;

    const formatSRTTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const millis = Math.floor((seconds % 1) * 1000);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    };

    entries.push(`${index + 1}\n${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n${scene.text}\n`);
  });

  return entries.join('\n');
}

/**
 * Preset ASS styles based on popular caption styles
 */
export const ASS_STYLES = {
  tiktok: {
    name: 'TikTok',
    fontName: 'Montserrat',
    fontSize: 24,
    primaryColour: '&HFFFFFF',
    outlineColour: '&H000000',
    backColour: '&H80000000',
    bold: 1,
    italic: 0,
    outline: 3,
    shadow: 2,
    alignment: 2,
    marginV: 60,
  } as ASSStyle,

  highlight: {
    name: 'Highlight',
    fontName: 'Poppins',
    fontSize: 22,
    primaryColour: '&H000000',
    backColour: '&H00EBFF3B', // Yellow background
    bold: 1,
    italic: 0,
    outline: 0,
    shadow: 0,
    alignment: 2,
    marginV: 60,
  } as ASSStyle,

  netflix: {
    name: 'Netflix',
    fontName: 'Consolas',
    fontSize: 20,
    primaryColour: '&HFFFFFF',
    backColour: '&H80000000',
    bold: 0,
    italic: 0,
    outline: 0,
    shadow: 1,
    alignment: 2,
    marginV: 60,
  } as ASSStyle,
};
