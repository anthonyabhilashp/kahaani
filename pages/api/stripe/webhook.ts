import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { addCredits } from "../../../lib/credits";
import { buffer } from "micro";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

// Disable body parser for webhooks
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  if (!sig || !webhookSecret) {
    console.error("Missing Stripe signature or webhook secret");
    return res.status(400).json({ error: "Webhook signature missing" });
  }

  let event: Stripe.Event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log(`✅ Received Stripe event: ${event.type}`);

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log(`💰 Checkout session completed: ${session.id}`);
        console.log(`   Payment status: ${session.payment_status}`);
        console.log(`   Customer: ${session.customer_email}`);

        if (session.payment_status === 'paid') {
          const userId = session.metadata?.user_id;
          const credits = parseInt(session.metadata?.credits || '0');

          if (!userId || !credits) {
            console.error("Missing user_id or credits in session metadata");
            return res.status(400).json({ error: "Invalid session metadata" });
          }

          console.log(`   Adding ${credits} credits to user ${userId}`);

          // Add credits using existing credits system
          const result = await addCredits(
            userId,
            credits,
            'purchase',
            `Purchased ${credits} credits via Stripe (Session: ${session.id})`
          );

          if (!result.success) {
            console.error("Failed to add credits");
            return res.status(500).json({ error: "Failed to add credits" });
          }

          console.log(`✅ Successfully added ${credits} credits. New balance: ${result.newBalance}`);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`💳 Payment succeeded: ${paymentIntent.id}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.error(`❌ Payment failed: ${paymentIntent.id}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error(`Webhook handler error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
