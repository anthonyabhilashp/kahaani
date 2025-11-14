// Credit costs and constants
// This file is safe to import in both browser and server

export const CREDIT_COSTS = {
  IMAGE_PER_SCENE: 1,          // 1 credit per image (per scene)
  AUDIO_PER_SCENE: 1,          // 1 credit per audio (per scene)
  VIDEO_GENERATION: 0,         // Free - no credits for video generation
  VIDEO_UPLOAD_BASE: 3,        // 3 credits per minute of video upload + transcription
} as const;

// Calculate video upload cost based on duration (in seconds)
// 3 credits per minute (or partial minute)
export function calculateVideoUploadCost(durationInSeconds: number): number {
  if (durationInSeconds <= 0) return CREDIT_COSTS.VIDEO_UPLOAD_BASE;
  const minutes = Math.ceil(durationInSeconds / 60);
  return minutes * CREDIT_COSTS.VIDEO_UPLOAD_BASE;
}

export const NEW_USER_CREDITS = 15; // Free credits for new users (enough for one 5-scene story)

export type TransactionType =
  | 'purchase'
  | 'free_signup'
  | 'refund'
  | 'deduction_images'
  | 'deduction_audio'
  | 'deduction_video'
  | 'deduction_video_upload'
  | 'admin_adjustment';
