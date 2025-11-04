-- Add character library and reference system to series table
-- This enables character consistency across episodes in a series

ALTER TABLE series
ADD COLUMN IF NOT EXISTS character_library JSONB DEFAULT '{"characters":[],"environments":[],"props":[]}'::jsonb;

ALTER TABLE series
ADD COLUMN IF NOT EXISTS reference_image_url TEXT;

ALTER TABLE series
ADD COLUMN IF NOT EXISTS style_guide TEXT DEFAULT 'cinematic illustration';

-- Add comment
COMMENT ON COLUMN series.character_library IS 'Stores merged character descriptions from all episodes';
COMMENT ON COLUMN series.reference_image_url IS 'Latest reference image URL - evolves with each episode';
COMMENT ON COLUMN series.style_guide IS 'Default visual style for the series';
