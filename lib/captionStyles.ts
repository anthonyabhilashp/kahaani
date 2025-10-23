/**
 * Caption Styles Library
 *
 * A comprehensive collection of trendy, industry-standard caption styles
 * for short-form video content (TikTok, Reels, Shorts).
 *
 * All fonts are from Google Fonts - 100% free and legal to use.
 *
 * @license MIT
 * @version 1.0.0
 */

export interface CaptionStyle {
  id: string;
  name: string;
  description: string;
  category: 'popular' | 'creative' | 'professional' | 'fun';

  // CSS Properties for Preview (React/Web)
  fontFamily: string;
  fontSize: string; // Base size, will be scaled
  fontWeight: string | number;
  color: string;
  textShadow?: string;
  textStroke?: string; // -webkit-text-stroke
  background?: string;
  backdropFilter?: string;
  padding?: string;
  borderRadius?: string;
  border?: string;
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';

  // FFmpeg ASS Subtitle Properties
  ffmpegStyle: {
    fontName: string;
    fontSize: string; // Will be replaced with actual size
    primaryColour: string; // ASS color format: &HAABBGGRR
    secondaryColour?: string;
    outlineColour?: string;
    backColour?: string;
    bold: 0 | 1 | -1;
    italic: 0 | 1;
    outline: number;
    shadow: number;
    alignment: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; // 1-9 = pos, 10 = center
    marginV: number;
  };
}

export const CAPTION_STYLES: CaptionStyle[] = [
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Bold white text with black outline - Most popular style',
    category: 'popular',
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '1em',
    fontWeight: 900,
    color: '#FFFFFF',
    textShadow: '0 0 10px rgba(0,0,0,0.8)',
    textStroke: '3px #000000',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    ffmpegStyle: {
      fontName: 'Montserrat',
      fontSize: '${fontSize}',
      primaryColour: '&HFFFFFF', // White
      outlineColour: '&H000000', // Black
      backColour: '&H80000000',
      bold: 1,
      italic: 0,
      outline: 3,
      shadow: 2,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'highlight',
    name: 'Highlight',
    description: 'Yellow highlighter background - Perfect for key points',
    category: 'popular',
    fontFamily: "'Poppins', sans-serif",
    fontSize: '0.95em',
    fontWeight: 700,
    color: '#000000',
    background: '#FFEB3B',
    padding: '8px 16px',
    borderRadius: '4px',
    textTransform: 'none',
    ffmpegStyle: {
      fontName: 'Poppins',
      fontSize: '${fontSize}',
      primaryColour: '&H000000', // Black text
      backColour: '&H00EBFF3B', // Yellow background (AABBGGRR)
      bold: 1,
      italic: 0,
      outline: 0,
      shadow: 0,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'mrbeast',
    name: 'MrBeast',
    description: 'Giant bold yellow text - High energy & attention-grabbing',
    category: 'popular',
    fontFamily: "'Anton', sans-serif",
    fontSize: '1.3em',
    fontWeight: 400,
    color: '#FFD700',
    textShadow: '4px 4px 0px #000000, 8px 8px 0px rgba(0,0,0,0.3)',
    textStroke: '4px #000000',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    ffmpegStyle: {
      fontName: 'Anton',
      fontSize: '${fontSize}',
      primaryColour: '&H00D7FF', // Gold
      outlineColour: '&H000000',
      backColour: '&H80000000',
      bold: 1,
      italic: 0,
      outline: 4,
      shadow: 3,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    description: 'Glowing neon text - Perfect for night/club vibes',
    category: 'creative',
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '1em',
    fontWeight: 700,
    color: '#00F0FF',
    textShadow: '0 0 10px #00F0FF, 0 0 20px #00F0FF, 0 0 30px #00F0FF, 0 0 40px #00F0FF',
    background: 'rgba(0, 20, 40, 0.7)',
    padding: '12px 24px',
    borderRadius: '8px',
    backdropFilter: 'blur(10px)',
    textTransform: 'uppercase',
    ffmpegStyle: {
      fontName: 'Montserrat',
      fontSize: '${fontSize}',
      primaryColour: '&HFFF000', // Cyan
      outlineColour: '&H00F0FF',
      backColour: '&HB0281400', // Dark blue background
      bold: 1,
      italic: 0,
      outline: 2,
      shadow: 4,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'gradient',
    name: 'Gradient Pop',
    description: 'Colorful gradient text - Vibrant and eye-catching',
    category: 'creative',
    fontFamily: "'Poppins', sans-serif",
    fontSize: '1.1em',
    fontWeight: 800,
    color: '#FF6B9D', // Fallback
    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
    textStroke: '2px rgba(0,0,0,0.3)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    // Note: Gradient requires special handling in CSS (background-clip: text)
    ffmpegStyle: {
      fontName: 'Poppins',
      fontSize: '${fontSize}',
      primaryColour: '&H9D6BFF', // Pink (BBGGRR)
      secondaryColour: '&HFF6BB9', // Purple for gradient
      outlineColour: '&H80000000',
      backColour: '&H00000000',
      bold: 1,
      italic: 0,
      outline: 2,
      shadow: 2,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Glassmorphism effect - Modern and sleek',
    category: 'professional',
    fontFamily: "'Poppins', sans-serif",
    fontSize: '1em',
    fontWeight: 600,
    color: '#FFFFFF',
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(20px)',
    padding: '16px 24px',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
    textTransform: 'none',
    ffmpegStyle: {
      fontName: 'Poppins',
      fontSize: '${fontSize}',
      primaryColour: '&HFFFFFF',
      backColour: '&H1AFFFFFF', // Semi-transparent white
      bold: 0,
      italic: 0,
      outline: 0,
      shadow: 1,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean and simple - Professional look',
    category: 'professional',
    fontFamily: "'Poppins', sans-serif",
    fontSize: '0.9em',
    fontWeight: 600,
    color: '#FFFFFF',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '10px 20px',
    borderRadius: '8px',
    textTransform: 'none',
    ffmpegStyle: {
      fontName: 'Poppins',
      fontSize: '${fontSize}',
      primaryColour: '&HFFFFFF',
      backColour: '&H66000000',
      bold: 0,
      italic: 0,
      outline: 0,
      shadow: 2,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'comic',
    name: 'Comic',
    description: 'Comic book style - Fun and playful',
    category: 'fun',
    fontFamily: "'Bangers', cursive",
    fontSize: '1.2em',
    fontWeight: 400,
    color: '#FFEB3B',
    textShadow: '3px 3px 0px #000000',
    textStroke: '2px #000000',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    ffmpegStyle: {
      fontName: 'Bangers',
      fontSize: '${fontSize}',
      primaryColour: '&H3BEBFF', // Yellow
      outlineColour: '&H000000',
      backColour: '&H00000000',
      bold: 0,
      italic: 0,
      outline: 2,
      shadow: 1,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'bubble',
    name: 'Bubble',
    description: 'Rounded soft bubble - Friendly and approachable',
    category: 'fun',
    fontFamily: "'Fredoka', sans-serif",
    fontSize: '1em',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#FF6B9D',
    padding: '12px 24px',
    borderRadius: '50px',
    textShadow: '0 4px 8px rgba(0,0,0,0.3)',
    textTransform: 'none',
    ffmpegStyle: {
      fontName: 'Fredoka',
      fontSize: '${fontSize}',
      primaryColour: '&HFFFFFF',
      backColour: '&H009D6BFF', // Pink
      bold: 1,
      italic: 0,
      outline: 0,
      shadow: 2,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'outlined',
    name: 'Outlined',
    description: 'Thick outline only - Bold statement',
    category: 'creative',
    fontFamily: "'Oswald', sans-serif",
    fontSize: '1.1em',
    fontWeight: 700,
    color: 'transparent',
    textStroke: '3px #FFFFFF',
    textShadow: '4px 4px 0px rgba(0,0,0,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    ffmpegStyle: {
      fontName: 'Oswald',
      fontSize: '${fontSize}',
      primaryColour: '&H00FFFFFF', // Transparent (requires special handling)
      outlineColour: '&HFFFFFF',
      backColour: '&H00000000',
      bold: 1,
      italic: 0,
      outline: 3,
      shadow: 2,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'shadow',
    name: 'Shadow Pop',
    description: 'Heavy drop shadow - 3D depth effect',
    category: 'creative',
    fontFamily: "'Righteous', cursive",
    fontSize: '1.1em',
    fontWeight: 400,
    color: '#FFFFFF',
    textShadow: '5px 5px 0px rgba(0,0,0,0.8), 10px 10px 20px rgba(0,0,0,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    ffmpegStyle: {
      fontName: 'Righteous',
      fontSize: '${fontSize}',
      primaryColour: '&HFFFFFF',
      outlineColour: '&H00000000',
      backColour: '&H00000000',
      bold: 0,
      italic: 0,
      outline: 0,
      shadow: 5,
      alignment: 2,
      marginV: 60,
    },
  },
  {
    id: 'retro',
    name: 'Retro',
    description: '80s/90s style - Nostalgic vibe',
    category: 'fun',
    fontFamily: "'Rubik Mono One', sans-serif",
    fontSize: '0.95em',
    fontWeight: 400,
    color: '#FF00FF',
    textShadow: '3px 3px 0px #00FFFF, 6px 6px 0px #FFFF00',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    ffmpegStyle: {
      fontName: 'Rubik Mono One',
      fontSize: '${fontSize}',
      primaryColour: '&HFF00FF', // Magenta
      secondaryColour: '&H00FFFF', // Cyan shadow
      outlineColour: '&H00FFFF',
      backColour: '&H00000000',
      bold: 0,
      italic: 0,
      outline: 1,
      shadow: 3,
      alignment: 2,
      marginV: 60,
    },
  },
];

/**
 * Get caption style by ID
 */
export function getCaptionStyle(id: string): CaptionStyle | undefined {
  return CAPTION_STYLES.find(style => style.id === id);
}

/**
 * Get styles by category
 */
export function getCaptionStylesByCategory(category: CaptionStyle['category']): CaptionStyle[] {
  return CAPTION_STYLES.filter(style => style.category === category);
}

/**
 * Get all caption style IDs
 */
export function getAllCaptionStyleIds(): string[] {
  return CAPTION_STYLES.map(style => style.id);
}

/**
 * Convert RGB hex color to ASS color format (&HAABBGGRR)
 */
export function rgbToAssColor(hex: string, alpha: number = 0): string {
  // Remove # if present
  hex = hex.replace('#', '');

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const aa = Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
  const bb = b.toString(16).padStart(2, '0').toUpperCase();
  const gg = g.toString(16).padStart(2, '0').toUpperCase();
  const rr = r.toString(16).padStart(2, '0').toUpperCase();

  return `&H${aa}${bb}${gg}${rr}`;
}
