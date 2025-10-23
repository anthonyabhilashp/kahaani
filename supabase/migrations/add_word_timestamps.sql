-- Add word_timestamps column to scenes table
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS word_timestamps JSONB;

-- Add comment explaining the structure
COMMENT ON COLUMN scenes.word_timestamps IS 'Word-level timestamps from forced alignment. Format: [{"word": "hello", "start": 0.0, "end": 0.5}, ...]';
