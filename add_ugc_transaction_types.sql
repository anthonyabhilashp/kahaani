-- Add UGC transaction types to credit_transactions check constraint

-- Drop the old constraint
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

-- Add new constraint with UGC types
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type IN (
  'purchase',
  'free_signup',
  'refund',
  'deduction_images',
  'deduction_audio',
  'deduction_video',
  'deduction_video_upload',
  'deduction_video_from_image',
  'ugc_script_generation',
  'ugc_media_selection',
  'ugc_audio_generation',
  'admin_adjustment'
));
