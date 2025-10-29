// Credit costs and constants
// This file is safe to import in both browser and server

export const CREDIT_COSTS = {
  IMAGE_PER_SCENE: 1,   // 1 credit per image (per scene)
  AUDIO_PER_SCENE: 1,   // 1 credit per audio (per scene)
  VIDEO_GENERATION: 0,  // Free - no credits for video generation
} as const;

export const NEW_USER_CREDITS = 15; // Free credits for new users (enough for one 5-scene story)

export type TransactionType =
  | 'purchase'
  | 'free_signup'
  | 'refund'
  | 'deduction_images'
  | 'deduction_audio'
  | 'deduction_video'
  | 'admin_adjustment';
