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
  highlightColor?: string,
  wordsPerBatch: number = 0, // 0 = show all words, >0 = show N words at a time
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize' = 'none',
  fullText?: string // Optional: full text to detect sentence boundaries
): string {
  if (!wordTimestamps.length) return '';

  // Apply text transformation to all words
  const transformWord = (word: string): string => {
    switch (textTransform) {
      case 'uppercase':
        return word.toUpperCase();
      case 'lowercase':
        return word.toLowerCase();
      case 'capitalize':
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      default:
        return word;
    }
  };

  // Detect which word indices end sentences (using fullText if available)
  const sentenceEndIndices = new Set<number>();
  if (fullText) {
    const textWords = fullText.trim().split(/\s+/);
    textWords.forEach((word, idx) => {
      if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
        sentenceEndIndices.add(idx);
      }
    });
  }

  // Build batches respecting sentence boundaries (if wordsPerBatch > 0)
  const batches: Array<[number, number]> = []; // [startIndex, endIndex]
  if (wordsPerBatch > 0) {
    let currentBatchStart = 0;

    while (currentBatchStart < wordTimestamps.length) {
      let batchEnd = currentBatchStart;

      // Add up to wordsPerBatch words
      for (let i = 0; i < wordsPerBatch && batchEnd < wordTimestamps.length; i++) {
        batchEnd++;

        // Check if this word index ends a sentence
        if (sentenceEndIndices.has(batchEnd - 1)) {
          break; // End batch here, start new batch with next sentence
        }
      }

      batches.push([currentBatchStart, batchEnd]);
      currentBatchStart = batchEnd;
    }
  }

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
Style: ${style.name},${style.fontName},${style.fontSize},${style.primaryColour},${style.secondaryColour || style.primaryColour},${style.outlineColour || '&H00000000'},${style.backColour || '&H00000000'},${style.bold},${style.italic},0,0,100,100,0,0,1,${style.outline},${style.shadow},${style.alignment},${style.marginL || 10},${style.marginR || 10},${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue events with word-by-word highlighting
  const events: string[] = [];
  const totalDuration = wordTimestamps[wordTimestamps.length - 1].end;

  for (let i = 0; i < wordTimestamps.length; i++) {
    const currentWord = wordTimestamps[i];
    const start = formatTime(currentWord.start);
    const end = formatTime(i + 1 < wordTimestamps.length ? wordTimestamps[i + 1].start : totalDuration);

    // Determine which words to show based on wordsPerBatch
    let startIndex = 0;
    let endIndex = wordTimestamps.length;

    if (wordsPerBatch > 0) {
      // Find which batch contains the current word
      const activeBatch = batches.find(([batchStart, batchEnd]) =>
        i >= batchStart && i < batchEnd
      );

      if (activeBatch) {
        [startIndex, endIndex] = activeBatch;
      } else {
        // Fallback to first batch
        startIndex = 0;
        endIndex = Math.min(wordsPerBatch, wordTimestamps.length);
      }
    }

    // Build text with only visible words
    let text = '';

    for (let j = startIndex; j < endIndex; j++) {
      const word = transformWord(wordTimestamps[j].word);

      if (j < i) {
        // Past words - normal (already spoken)
        text += word + ' ';
      } else if (j === i) {
        // Current word - highlighted with bold, color, and scale (matches preview scale(1.1))
        if (highlightColor) {
          text += `{\\b1\\c${highlightColor}\\fscx110\\fscy110}${word}{\\b0\\c${style.primaryColour}\\fscx100\\fscy100} `;
        } else {
          text += `{\\b1\\fscx110\\fscy110}${word}{\\b0\\fscx100\\fscy100} `;
        }
      } else {
        // Future words - dimmed to 60% opacity (matches preview dimmedOpacity=0.6)
        // ASS alpha: 0=opaque, 255=transparent. 40% transparent = 0x66
        text += `{\\alpha&H66}${word}{\\alpha&H00} `;
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
