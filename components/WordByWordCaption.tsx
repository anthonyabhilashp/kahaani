/**
 * Word-by-Word Animated Caption Component
 *
 * Displays captions with word-by-word highlighting animation
 * synchronized with audio playback.
 */

import React, { useEffect, useState, useMemo } from 'react';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface WordByWordCaptionProps {
  wordTimestamps: WordTimestamp[];
  currentTime: number; // Current audio/video playback time in seconds
  style: React.CSSProperties;
  highlightColor?: string;
  inactiveColor?: string;
  dimmedOpacity?: number;
  wordsPerBatch?: number; // Show N words at a time (1-5)
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export const WordByWordCaption = React.memo(function WordByWordCaption({
  wordTimestamps,
  currentTime,
  style,
  highlightColor = '#FFEB3B', // Default yellow highlight
  inactiveColor,
  dimmedOpacity = 0.6,
  wordsPerBatch = 3, // Default 3 words at a time
  textTransform = 'none',
}: WordByWordCaptionProps) {
  if (!wordTimestamps || wordTimestamps.length === 0) {
    return null;
  }

  // Find current word index - memoized to avoid recalculation
  const currentWordIndex = useMemo(() =>
    wordTimestamps.findIndex((wt) => currentTime >= wt.start && currentTime < wt.end),
    [wordTimestamps, currentTime]
  );

  // Apply text transform to words
  const transformWord = useMemo(() => (word: string) => {
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
  }, [textTransform]);

  // Determine which words to show based on wordsPerBatch - memoized
  const { visibleWords, startIndex } = useMemo(() => {
    let visible = wordTimestamps;
    let start = 0;

    if (wordsPerBatch > 0) {
      // Determine the active index - use last word if between words
      let activeIndex = currentWordIndex >= 0 ? currentWordIndex :
                       (wordTimestamps.findIndex(wt => currentTime < wt.start) - 1);

      // If still not found, use the last word index
      if (activeIndex < 0) {
        activeIndex = wordTimestamps.length - 1;
      }

      // Calculate which batch the active word belongs to
      // Batch 0: words 0-2, Batch 1: words 3-5, Batch 2: words 6-8, etc.
      const batchIndex = Math.floor(activeIndex / wordsPerBatch);
      start = batchIndex * wordsPerBatch;
      const endIndex = Math.min(wordTimestamps.length, start + wordsPerBatch);

      visible = wordTimestamps.slice(start, endIndex);
    }

    return { visibleWords: visible, startIndex: start };
  }, [wordTimestamps, wordsPerBatch, currentWordIndex, currentTime]);

  // Get inactive word color (use inactiveColor prop or style.color)
  const inactiveWordColor = inactiveColor || style.color;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '0.5em',
        justifyContent: 'center',
        alignItems: 'center',
        maxWidth: '95%',
        lineHeight: '1.5',
        fontFamily: style.fontFamily,
      }}
    >
      {visibleWords.map((wt, visibleIndex) => {
        const actualIndex = wordsPerBatch > 0 ? startIndex + visibleIndex : visibleIndex;
        const isActive = currentWordIndex === actualIndex;
        const isPast = currentWordIndex > actualIndex;
        const isFuture = currentWordIndex < actualIndex;

        return (
          <span
            key={actualIndex}
            style={{
              opacity: isFuture ? dimmedOpacity : 1,
              fontWeight: isActive ? 'bold' : style.fontWeight,
              fontSize: style.fontSize || '20px',
              transform: isActive ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.15s ease-out',
              display: 'inline-block',
              textShadow: style.textShadow,
              WebkitTextStroke: style.WebkitTextStroke,
              color: isActive ? highlightColor : inactiveWordColor,
            }}
          >
            {transformWord(wt.word)}
          </span>
        );
      })}
    </div>
  );
});

/**
 * Simple Caption Component (no word-by-word, just static text)
 */
interface SimpleCaptionProps {
  text: string;
  style: React.CSSProperties;
}

export function SimpleCaption({ text, style }: SimpleCaptionProps) {
  return (
    <div style={style}>
      {text}
    </div>
  );
}
