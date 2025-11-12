import type { NextApiRequest, NextApiResponse } from "next";
import { Paddle, Environment } from "@paddle/paddle-node-sdk";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { checkRateLimit, RateLimits } from "../../../lib/rateLimit";

// Initialize Paddle
const paddle = new Paddle(process.env.PADDLE_API_KEY!, {
  environment: (process.env.PADDLE_ENVIRONMENT as Environment) || Environment.sandbox,
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

    // ⏱️ Rate limiting - prevent checkout abuse
    const rateLimit = checkRateLimit(user.id, RateLimits.PAYMENT);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      return res.status(429).json({
        error: "Too many checkout requests. Please wait before trying again.",
        retry_after: retryAfter
      });
    }

    const { credits, price } = req.body;

    // Validate credits amount
    if (!credits || !price || credits <= 0 || price <= 0) {
      return res.status(400).json({ error: "Invalid credits or price" });
    }

    // Validate package is one of the allowed options
    const validPackages = [
      { credits: 250, price: 20 },
      { credits: 1000, price: 70 },
      { credits: 3000, price: 180 }
    ];

    const isValidPackage = validPackages.some(
      pkg => pkg.credits === credits && pkg.price === price
    );

    if (!isValidPackage) {
      return res.status(400).json({ error: "Invalid package selected" });
    }

    // Create Paddle checkout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005';

    // Validate price ID exists
    const priceId = process.env[`PADDLE_PRICE_ID_${credits}`];
    console.log(`Credits: ${credits}, Price ID: ${priceId}`);

    if (!priceId) {
      throw new Error(`Missing PADDLE_PRICE_ID_${credits} environment variable`);
    }

    const transaction = await paddle.transactions.create({
      items: [
        {
          priceId: priceId,
          quantity: 1,
        },
      ],
      customData: {
        user_id: user.id,
        user_email: user.email!,
        credits: credits.toString(),
        price: price.toString(),
      },
      checkout: {
        url: `${appUrl}/credits`
      }
    });

    console.log(`Transaction created: ${transaction.id}`);
    console.log(`Checkout URL: ${(transaction as any).checkout?.url}`);

    res.status(200).json({
      checkoutUrl: (transaction as any).checkout?.url || null,
      transactionId: transaction.id
    });
  } catch (err: any) {
    console.error("Paddle checkout error:", JSON.stringify(err, null, 2));
    res.status(500).json({ error: err.message });
  }
}
