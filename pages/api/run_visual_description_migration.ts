import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("📊 Adding visual_description column to scenes table...");

    // Add the column using raw SQL
    const { error } = await supabaseAdmin.rpc('exec', {
      sql: `ALTER TABLE scenes ADD COLUMN IF NOT EXISTS visual_description TEXT;`
    });

    if (error) {
      // Column might already exist, that's okay
      console.log("ℹ️ Column might already exist:", error.message);
    }

    console.log("✅ Migration completed successfully");

    // Verify by selecting from the table
    const { data, error: verifyError } = await supabaseAdmin
      .from('scenes')
      .select('id, visual_description')
      .limit(1);

    if (verifyError) {
      console.error("❌ Verification failed:", verifyError);
      return res.status(500).json({
        error: "Migration may have failed",
        details: verifyError.message
      });
    }

    return res.status(200).json({
      message: "visual_description column added successfully",
      verified: true
    });

  } catch (err: any) {
    console.error("❌ Migration error:", err);
    return res.status(500).json({
      error: "Migration failed",
      details: err.message
    });
  }
}
