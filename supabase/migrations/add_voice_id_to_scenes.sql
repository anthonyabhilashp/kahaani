-- Add voice_id column to stories table for story-level default voice
ALTER TABLE stories ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT '21m00Tcm4TlvDq8ikWAM';

-- Add voice_id column to scenes table for scene-specific voice override
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS voice_id TEXT;

-- Add comments explaining the columns
COMMENT ON COLUMN stories.voice_id IS 'Default ElevenLabs voice ID for all scenes in this story';
COMMENT ON COLUMN scenes.voice_id IS 'Optional scene-specific voice ID override. If NULL, inherits from story.voice_id';
