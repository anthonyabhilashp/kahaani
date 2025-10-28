-- Add voice_id and aspect_ratio columns to stories table

-- Add voice_id column (default to Rachel voice)
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT '21m00Tcm4TlvDq8ikWAM';

-- Add aspect_ratio column (default to 9:16 portrait)
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16';

-- Add comment for documentation
COMMENT ON COLUMN stories.voice_id IS 'ElevenLabs voice ID for story narration';
COMMENT ON COLUMN stories.aspect_ratio IS 'Video aspect ratio (9:16 portrait, 1:1 square, 16:9 landscape)';
