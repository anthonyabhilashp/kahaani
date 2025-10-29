import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getUserCredits, getTransactionHistory } from "../../lib/credits";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get user ID from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user's credit balance
    const balance = await getUserCredits(user.id);

    // Optionally get recent transactions if requested
    const includeHistory = req.query.include_history === 'true';
    let transactions = null;

    if (includeHistory) {
      transactions = await getTransactionHistory(user.id, 10); // Last 10 transactions
    }

    res.status(200).json({
      user_id: user.id,
      balance,
      transactions
    });

  } catch (err: any) {
    console.error("Error getting user credits:", err);
    res.status(500).json({ error: err.message || "Failed to get credits" });
  }
}
