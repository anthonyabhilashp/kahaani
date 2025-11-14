-- Migration: Add video_url support for scene-level video uploads
-- This allows scenes to have either an image (AI-generated) or an uploaded video clip

-- 1️⃣ Add video_url column to scenes table
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add comment for clarity
COMMENT ON COLUMN scenes.video_url IS 'URL to uploaded video clip for this scene (alternative to image_url)';

-- 2️⃣ Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_scenes_video_url ON scenes(video_url) WHERE video_url IS NOT NULL;

-- 3️⃣ Update credit_transactions CHECK constraint to include 'deduction_video_upload'
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type = ANY (ARRAY[
    'purchase'::text,
    'free_signup'::text,
    'refund'::text,
    'deduction_images'::text,
    'deduction_audio'::text,
    'deduction_video'::text,
    'deduction_video_upload'::text,
    'admin_adjustment'::text
  ]));
