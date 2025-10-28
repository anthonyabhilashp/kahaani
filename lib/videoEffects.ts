/**
 * Video Effects Library
 * Defines all available motion effects and their FFmpeg filter configurations
 */

export type EffectType =
  | "none"
  | "floating"
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "zoom_pan"
  | "zoom_out_pan";

export interface VideoEffect {
  id: EffectType;
  name: string;
  description: string;
  isPro: boolean;
  /**
   * Returns the FFmpeg zoompan filter string for this effect
   * @param width Video width in pixels
   * @param height Video height in pixels
   * @param duration Scene duration in seconds
   */
  getFilter: (width: number, height: number, duration: number) => string;
}

export const VIDEO_EFFECTS: Record<EffectType, VideoEffect> = {
  none: {
    id: "none",
    name: "None",
    description: "No motion effect - static image",
    isPro: false,
    getFilter: (w, h) => "",  // No zoompan filter applied
  },

  floating: {
    id: "floating",
    name: "Floating",
    description: "Gentle drift with subtle zoom",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      // Very subtle floating effect
      return `zoompan=z='1.02+0.01*sin(2*PI*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },

  zoom_in: {
    id: "zoom_in",
    name: "Zoom In",
    description: "Gradual zoom into the image",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      // Smooth zoom in
      return `zoompan=z='1+0.08*on/${totalFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },

  zoom_out: {
    id: "zoom_out",
    name: "Zoom Out",
    description: "Start zoomed in, pull back",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      // Smooth zoom out
      return `zoompan=z='1.08-0.08*on/${totalFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },

  pan_left: {
    id: "pan_left",
    name: "Pan Left",
    description: "Camera slides left across image",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      const zoomLevel = 1.05;
      const panRange = w * 0.04;
      return `zoompan=z=${zoomLevel}:x='iw/2-(iw/zoom/2)+(${panRange}-2*${panRange}*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },

  pan_right: {
    id: "pan_right",
    name: "Pan Right",
    description: "Camera slides right across image",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      const zoomLevel = 1.05;
      const panRange = w * 0.04;
      return `zoompan=z=${zoomLevel}:x='iw/2-(iw/zoom/2)+(-${panRange}+2*${panRange}*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },

  zoom_pan: {
    id: "zoom_pan",
    name: "Zoom & Pan",
    description: "Zoom in while panning right",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      const panRange = w * 0.03;
      return `zoompan=z='1+0.1*on/${totalFrames}':x='iw/2-(iw/zoom/2)+(-${panRange}+2*${panRange}*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },

  zoom_out_pan: {
    id: "zoom_out_pan",
    name: "Zoom Out & Pan",
    description: "Zoom out while panning left",
    isPro: false,
    getFilter: (w, h, duration) => {
      const fps = 30;
      const totalFrames = Math.round(duration * fps);
      const panRange = w * 0.03;
      return `zoompan=z='1.1-0.1*on/${totalFrames}':x='iw/2-(iw/zoom/2)+(${panRange}-2*${panRange}*on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
    },
  },
};

/**
 * Get effect by ID with fallback to "none"
 */
export function getEffect(effectId: string): VideoEffect {
  return VIDEO_EFFECTS[effectId as EffectType] || VIDEO_EFFECTS.none;
}

/**
 * Get all available effects as an array
 */
export function getAllEffects(): VideoEffect[] {
  return Object.values(VIDEO_EFFECTS);
}

/**
 * Get CSS animation class for effect preview
 */
export function getEffectAnimationClass(effectId: string): string {
  const animations: Record<EffectType, string> = {
    none: "",
    floating: "animate-float",
    zoom_in: "animate-zoom-in",
    zoom_out: "animate-zoom-out",
    pan_left: "animate-pan-left",
    pan_right: "animate-pan-right",
    zoom_pan: "animate-zoom-pan",
    zoom_out_pan: "animate-zoom-out-pan",
  };
  return animations[effectId as EffectType] || "";
}
