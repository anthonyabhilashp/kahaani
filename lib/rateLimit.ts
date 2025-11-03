/**
 * Simple in-memory rate limiter
 * Prevents API endpoint abuse
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  });
}, 5 * 60 * 1000);

interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  maxRequests: number; // Max requests per interval
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (user ID, IP, etc.)
 * @param config - Rate limit configuration
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { interval: 60000, maxRequests: 10 } // Default: 10 req/min
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  // No entry or expired - create new
  if (!entry || now > entry.resetTime) {
    const resetTime = now + config.interval;
    rateLimitMap.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: config.maxRequests - 1, resetTime };
  }

  // Increment count
  entry.count++;

  // Check if exceeded
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Reset rate limit for an identifier (useful for testing)
 */
export function resetRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}

/**
 * Rate limit presets for different operations
 */
export const RateLimits = {
  // General API requests (light operations)
  API_GENERAL: { interval: 60000, maxRequests: 60 }, // 60 req/min

  // Story generation (expensive LLM calls)
  STORY_GENERATION: { interval: 60000, maxRequests: 5 }, // 5 stories/min

  // Image generation (expensive API calls)
  IMAGE_GENERATION: { interval: 60000, maxRequests: 3 }, // 3 batches/min

  // Video generation (very expensive CPU + API)
  VIDEO_GENERATION: { interval: 300000, maxRequests: 5 }, // 5 videos/5min

  // Audio generation
  AUDIO_GENERATION: { interval: 60000, maxRequests: 5 }, // 5 batches/min

  // Auth endpoints (prevent brute force)
  AUTH: { interval: 300000, maxRequests: 10 }, // 10 attempts/5min

  // Payment endpoints
  PAYMENT: { interval: 60000, maxRequests: 5 }, // 5 checkout/min
};
