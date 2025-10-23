import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log('🚀 Checking database migration status...');

    // Check if columns already exist by trying to query them
    const { data: existingStories, error: checkError } = await supabaseAdmin
      .from('stories')
      .select('default_image_style, image_instructions')
      .limit(1);

    if (!checkError) {
      console.log('✅ Columns already exist!');
      return res.status(200).json({
        success: true,
        message: 'Migration already applied. Columns already exist.',
        sample: existingStories
      });
    }

    // Columns don't exist yet
    return res.status(200).json({
      success: false,
      message: 'Columns do not exist yet. Please run the SQL migration manually in Supabase Dashboard.',
      sql: [
        "ALTER TABLE stories ADD COLUMN IF NOT EXISTS default_image_style TEXT DEFAULT 'cinematic illustration';",
        "ALTER TABLE stories ADD COLUMN IF NOT EXISTS image_instructions TEXT;",
        "COMMENT ON COLUMN stories.default_image_style IS 'Default art style for image generation (e.g., cinematic illustration, realistic photo, anime)';",
        "COMMENT ON COLUMN stories.image_instructions IS 'Optional default instructions/prompt additions for image generation';"
      ]
    });

  } catch (err: any) {
    console.error('❌ Migration check error:', err);
    return res.status(500).json({ error: err.message });
  }
}
