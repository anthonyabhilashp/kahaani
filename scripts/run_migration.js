const { supabaseAdmin } = require('../lib/supabaseAdmin');

async function runMigration() {
  try {
    console.log('🚀 Running database migration...');
    console.log('⏳ Adding default_image_style and image_instructions columns to stories table...\n');

    // Check if columns already exist by trying to query them
    const { data: existingStories, error: checkError } = await supabaseAdmin
      .from('stories')
      .select('default_image_style, image_instructions')
      .limit(1);

    if (!checkError) {
      console.log('✅ Columns already exist! Migration already applied.');
      console.log('Sample data:', existingStories);
      process.exit(0);
    }

    // If we get here, columns don't exist yet
    console.log('Columns do not exist yet. Please run the SQL migration manually in Supabase Dashboard:');
    console.log('\n--- Copy and paste this SQL into Supabase SQL Editor ---\n');
    console.log('ALTER TABLE stories ADD COLUMN IF NOT EXISTS default_image_style TEXT DEFAULT \'cinematic illustration\';');
    console.log('ALTER TABLE stories ADD COLUMN IF NOT EXISTS image_instructions TEXT;');
    console.log('\nCOMMENT ON COLUMN stories.default_image_style IS \'Default art style for image generation (e.g., cinematic illustration, realistic photo, anime)\';');
    console.log('COMMENT ON COLUMN stories.image_instructions IS \'Optional default instructions/prompt additions for image generation\';');
    console.log('\n--- End of SQL ---\n');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

runMigration();
