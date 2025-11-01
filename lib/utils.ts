import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate suggested scene duration based on text length
 * Uses average reading speed of 2 words per second for video captions
 * @param text - Scene text to calculate duration for
 * @returns Duration in seconds (min: 3s, max: 20s)
 */
export function calculateSceneDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const readingSpeed = 2; // words per second (comfortable for captions)
  const calculatedDuration = words / readingSpeed;

  // Clamp between 3 and 20 seconds
  const minDuration = 3;
  const maxDuration = 20;

  return Math.max(minDuration, Math.min(maxDuration, calculatedDuration));
}
