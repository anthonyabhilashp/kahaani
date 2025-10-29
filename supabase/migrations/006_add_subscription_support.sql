-- Add subscription columns to user_credits table
ALTER TABLE user_credits
ADD COLUMN IF NOT EXISTS is_subscribed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster subscription queries
CREATE INDEX IF NOT EXISTS idx_user_credits_subscription ON user_credits(is_subscribed, subscription_expires_at);

-- Add comments
COMMENT ON COLUMN user_credits.is_subscribed IS 'Whether user has an active subscription';
COMMENT ON COLUMN user_credits.subscription_tier IS 'Subscription tier: free, basic, pro, enterprise';
COMMENT ON COLUMN user_credits.subscription_started_at IS 'When subscription started';
COMMENT ON COLUMN user_credits.subscription_expires_at IS 'When subscription expires (NULL for lifetime)';

-- Update existing users to free tier
UPDATE user_credits SET subscription_tier = 'free', is_subscribed = FALSE WHERE subscription_tier IS NULL;
