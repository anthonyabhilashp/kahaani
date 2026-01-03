-- UGC Video Generator Database Migration
-- Run this in your Supabase SQL Editor

-- Create ugc_videos table
CREATE TABLE IF NOT EXISTS ugc_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  input_text TEXT NOT NULL,
  script_text TEXT NOT NULL,
  voice_id TEXT DEFAULT 'nova',
  aspect_ratio TEXT DEFAULT '9:16',
  caption_settings JSONB DEFAULT '{
    "enabled": true,
    "style": "tiktok",
    "fontFamily": "Montserrat",
    "fontSize": 20,
    "fontWeight": 900,
    "activeColor": "#02f7f3",
    "inactiveColor": "#FFFFFF",
    "wordsPerBatch": 2,
    "textTransform": "uppercase",
    "positionFromBottom": 25
  }'::jsonb,
  background_music_enabled BOOLEAN DEFAULT false,
  background_music_id UUID,
  background_music_volume INT DEFAULT 20,
  video_url TEXT,
  duration FLOAT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ugc_clips table
CREATE TABLE IF NOT EXISTS ugc_clips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ugc_video_id UUID NOT NULL REFERENCES ugc_videos(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  text TEXT NOT NULL,
  duration FLOAT NOT NULL,
  media_type TEXT,
  media_url TEXT,
  audio_url TEXT,
  word_timestamps JSONB,
  audio_generated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ugc_videos_user_id ON ugc_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_ugc_videos_created_at ON ugc_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_clips_video_id ON ugc_clips(ugc_video_id);
CREATE INDEX IF NOT EXISTS idx_ugc_clips_order ON ugc_clips(ugc_video_id, order_index);

-- Enable Row Level Security
ALTER TABLE ugc_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_clips ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ugc_videos
CREATE POLICY "Users can view their own UGC videos"
  ON ugc_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own UGC videos"
  ON ugc_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own UGC videos"
  ON ugc_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own UGC videos"
  ON ugc_videos FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for ugc_clips
CREATE POLICY "Users can view clips of their own UGC videos"
  ON ugc_clips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ugc_videos
      WHERE ugc_videos.id = ugc_clips.ugc_video_id
      AND ugc_videos.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert clips for their own UGC videos"
  ON ugc_clips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ugc_videos
      WHERE ugc_videos.id = ugc_clips.ugc_video_id
      AND ugc_videos.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update clips of their own UGC videos"
  ON ugc_clips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ugc_videos
      WHERE ugc_videos.id = ugc_clips.ugc_video_id
      AND ugc_videos.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete clips of their own UGC videos"
  ON ugc_clips FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ugc_videos
      WHERE ugc_videos.id = ugc_clips.ugc_video_id
      AND ugc_videos.user_id = auth.uid()
    )
  );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_ugc_videos_updated_at
  BEFORE UPDATE ON ugc_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for UGC media (run this in Supabase Storage section or via SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('ugc_media', 'ugc_media', true)
-- ON CONFLICT (id) DO NOTHING;
