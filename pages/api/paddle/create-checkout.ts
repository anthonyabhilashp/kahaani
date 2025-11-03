import type { NextApiRequest, NextApiResponse } from "next";
import { initializePaddle, Paddle } from "@paddle/paddle-node-sdk";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Initialize Paddle
const paddle: Paddle = initializePaddle({
  environment: process.env.PADDLE_ENVIRONMENT as "sandbox" | "production" || "sandbox",
  apiKey: process.env.PADDLE_API_KEY!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 🔐 Get authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - Please log in" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid session" });
    }

    const { credits, price } = req.body;

    // Validate credits amount
    if (!credits || !price || credits <= 0 || price <= 0) {
      return res.status(400).json({ error: "Invalid credits or price" });
    }

    // Validate package is one of the allowed options
    const validPackages = [
      { credits: 25, price: 20 },
      { credits: 100, price: 70 },
      { credits: 300, price: 180 },
      { credits: 1000, price: 500 }
    ];

    const isValidPackage = validPackages.some(
      pkg => pkg.credits === credits && pkg.price === price
    );

    if (!isValidPackage) {
      return res.status(400).json({ error: "Invalid package selected" });
    }

    // Create Paddle checkout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005';

    const checkout = await paddle.transactions.create({
      items: [
        {
          priceId: process.env[`PADDLE_PRICE_ID_${credits}`]!, // We'll set up price IDs in Paddle dashboard
          quantity: 1,
        },
      ],
      customData: {
        user_id: user.id,
        user_email: user.email!,
        credits: credits.toString(),
        price: price.toString(),
      },
      customerEmail: user.email!,
      checkoutSettings: {
        successUrl: `${appUrl}/credits?success=true`,
        allowLogout: false,
      },
    });

    res.status(200).json({
      checkoutUrl: checkout.data?.checkoutUrl,
      transactionId: checkout.data?.id
    });
  } catch (err: any) {
    console.error("Paddle checkout error:", err);
    res.status(500).json({ error: err.message });
  }
}
