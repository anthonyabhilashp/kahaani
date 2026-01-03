/**
 * UGC Video Generator Default Settings
 *
 * Optimized for viral short-form content (TikTok/Instagram/YouTube Shorts style)
 */

export const UGC_DEFAULTS = {
  // Video settings
  aspect_ratio: '9:16' as const,
  voice_id: 'nova', // Warm, friendly female voice (most UGC-friendly)

  // Caption settings (TikTok style)
  caption_settings: {
    enabled: true,
    style: 'tiktok',
    fontFamily: 'Montserrat',
    fontSize: 20,
    fontWeight: 900,
    activeColor: '#02f7f3', // Cyan highlight
    inactiveColor: '#FFFFFF',
    wordsPerBatch: 2, // Snappy pacing
    textTransform: 'uppercase' as const,
    positionFromBottom: 25,
    outlineColor: '#000000',
    outlineWidth: 3
  },

  // Video effects
  video_effect: 'floating', // Subtle organic motion

  // Audio settings
  background_music_enabled: false,
  background_music_volume: 20,

  // Watermark
  watermark_enabled: true
};

/**
 * Alternative voice options for UGC
 */
export const UGC_VOICE_OPTIONS = [
  {
    id: 'nova',
    name: 'Nova',
    description: 'Warm, friendly female (recommended)',
    gender: 'female',
    tone: 'conversational'
  },
  {
    id: 'coral',
    name: 'Coral',
    description: 'Bright, energetic female',
    gender: 'female',
    tone: 'upbeat'
  },
  {
    id: 'echo',
    name: 'Echo',
    description: 'Clear, professional male',
    gender: 'male',
    tone: 'clear'
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    description: 'Gentle, soothing female',
    gender: 'female',
    tone: 'calm'
  },
  {
    id: 'onyx',
    name: 'Onyx',
    description: 'Deep, authoritative male',
    gender: 'male',
    tone: 'deep'
  }
];

/**
 * UGC-optimized caption styles
 */
export const UGC_CAPTION_STYLES = [
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Bold white text with black outline',
    settings: {
      fontFamily: 'Montserrat',
      fontWeight: 900,
      activeColor: '#02f7f3',
      inactiveColor: '#FFFFFF',
      textTransform: 'uppercase',
      wordsPerBatch: 2
    }
  },
  {
    id: 'highlight',
    name: 'Highlight',
    description: 'Yellow background, black text',
    settings: {
      fontFamily: 'Poppins',
      fontWeight: 700,
      activeColor: '#000000',
      inactiveColor: '#666666',
      backgroundColor: '#FFD700',
      wordsPerBatch: 3
    }
  },
  {
    id: 'mrbeast',
    name: 'MrBeast',
    description: 'Giant gold text, high energy',
    settings: {
      fontFamily: 'Anton',
      fontWeight: 400,
      fontSize: 22,
      activeColor: '#FFD700',
      inactiveColor: '#FFFFFF',
      textTransform: 'uppercase',
      wordsPerBatch: 1
    }
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean dark background, simple text',
    settings: {
      fontFamily: 'Inter',
      fontWeight: 600,
      activeColor: '#FFFFFF',
      inactiveColor: '#999999',
      backgroundColor: 'rgba(0,0,0,0.7)',
      wordsPerBatch: 3
    }
  }
];

/**
 * Media type options for UGC videos
 */
export const UGC_MEDIA_TYPES = {
  STOCK_VIDEO: 'stock_video',
  STOCK_PHOTO: 'stock_photo',
  AI_IMAGE: 'ai_image',
  UPLOADED_VIDEO: 'uploaded_video',
  UPLOADED_IMAGE: 'uploaded_image'
} as const;

/**
 * Default media source (recommended)
 */
export const DEFAULT_MEDIA_SOURCE = 'stock_video';

/**
 * Keyword extraction stop words
 * Common words to filter out when extracting keywords for stock media search
 */
export const STOP_WORDS = [
  'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'you', 'your', 'this', 'that', 'it', 'its',
  'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'should',
  'can', 'could', 'may', 'might', 'must',
  'i', 'me', 'my', 'we', 'our', 'they', 'them'
];

/**
 * Extract keywords from text for stock media search
 * @param text Clip text
 * @param maxKeywords Maximum keywords to return
 * @returns Array of keywords
 */
export function extractKeywords(text: string, maxKeywords: number = 3): string[] {
  // Remove punctuation and split into words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.includes(w));

  // Return top N unique words
  return Array.from(new Set(words)).slice(0, maxKeywords);
}
