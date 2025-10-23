-- Add image generation defaults to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS default_image_style TEXT DEFAULT 'cinematic illustration';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS image_instructions TEXT;

-- Add comments explaining the columns
COMMENT ON COLUMN stories.default_image_style IS 'Default art style for image generation (e.g., cinematic illustration, realistic photo, anime)';
COMMENT ON COLUMN stories.image_instructions IS 'Optional default instructions/prompt additions for image generation';
