-- Migration: Add overlay support columns to ugc_videos table
-- Description: Adds columns needed for video overlay functionality (background video + avatar PIP)
-- Date: 2026-01-06

-- Add background video columns
ALTER TABLE ugc_videos ADD COLUMN IF NOT EXISTS background_video_url TEXT;
ALTER TABLE ugc_videos ADD COLUMN IF NOT EXISTS background_video_type TEXT DEFAULT 'none';

-- Add overlay configuration columns
ALTER TABLE ugc_videos ADD COLUMN IF NOT EXISTS overlay_enabled BOOLEAN DEFAULT true;
ALTER TABLE ugc_videos ADD COLUMN IF NOT EXISTS overlay_position TEXT DEFAULT 'bottom-right';
ALTER TABLE ugc_videos ADD COLUMN IF NOT EXISTS overlay_size INTEGER DEFAULT 35;

-- Comments explaining the columns
COMMENT ON COLUMN ugc_videos.background_video_url IS 'URL of the background/product video';
COMMENT ON COLUMN ugc_videos.background_video_type IS 'Type of background: none, uploaded, or stock';
COMMENT ON COLUMN ugc_videos.overlay_enabled IS 'Whether to overlay avatar on background';
COMMENT ON COLUMN ugc_videos.overlay_position IS 'Position of avatar overlay: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right';
COMMENT ON COLUMN ugc_videos.overlay_size IS 'Size of overlay as percentage (20-50)';
