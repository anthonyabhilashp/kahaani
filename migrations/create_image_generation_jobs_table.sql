-- Create image_generation_jobs table
CREATE TABLE IF NOT EXISTS image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  progress INTEGER DEFAULT 0, -- 0-100 percentage (for future use)
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_image_gen_jobs_story_status ON image_generation_jobs(story_id, status);
CREATE INDEX IF NOT EXISTS idx_image_gen_jobs_status ON image_generation_jobs(status);

-- Add RLS policies (Row Level Security)
ALTER TABLE image_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own image generation jobs
CREATE POLICY "Users can view their own image generation jobs" ON image_generation_jobs
  FOR SELECT
  USING (
    story_id IN (
      SELECT id FROM stories WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can do everything
CREATE POLICY "Service role has full access to image generation jobs" ON image_generation_jobs
  FOR ALL
  USING (auth.role() = 'service_role');
