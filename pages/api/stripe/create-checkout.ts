import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} AI Video Gen Credits`,
              description: `${credits} credits for image and audio generation. 1 credit = 1 image or 1 audio narration.`,
            },
            unit_amount: price * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/credits?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/credits?canceled=true`,
      metadata: {
        user_id: user.id,
        user_email: user.email!,
        credits: credits.toString(),
        price: price.toString(),
      },
      customer_email: user.email!,
    });

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: err.message });
  }
}
