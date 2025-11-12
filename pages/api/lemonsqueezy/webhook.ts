import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { addCredits } from "../../../lib/credits";
import getRawBody from "raw-body";

export const config = {
  api: {
    bodyParser: false, // Disable body parsing to get raw body for signature verification
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    const bodyString = rawBody.toString('utf8');

    // Verify webhook signature
    const signature = req.headers['x-signature'] as string;
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    if (!secret) {
      console.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set in environment variables");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    if (!signature) {
      console.error("Missing LemonSqueezy signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify signature using raw body
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(bodyString).digest('hex');

    if (digest !== signature) {
      console.error("Invalid LemonSqueezy signature");
      console.error("Expected:", signature);
      console.error("Computed:", digest);
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse body after signature verification
    const event = JSON.parse(bodyString);
    const eventName = event.meta.event_name;

    console.log(`✅ Received LemonSqueezy event: ${eventName}`);

    // Handle order created event
    if (eventName === 'order_created') {
      const order = event.data;

      // Extract custom data from meta (LemonSqueezy puts it here)
      const userId = event.meta.custom_data?.user_id;
      const credits = parseInt(event.meta.custom_data?.credits || '0');

      if (!userId || !credits) {
        console.error("Missing user_id or credits in webhook data");
        return res.status(400).json({ error: "Invalid webhook data" });
      }

      console.log(`💰 Order completed for user ${userId}: ${credits} credits`);

      // Add credits to user account
      const result = await addCredits(
        userId,
        credits,
        'purchase',
        `Purchased ${credits} credits via LemonSqueezy (Order: ${order.id})`
      );

      if (!result.success) {
        console.error("Failed to add credits to user account");
        return res.status(500).json({ error: "Failed to add credits" });
      }

      console.log(`✅ Successfully added ${credits} credits. New balance: ${result.newBalance}`);
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error(`LemonSqueezy webhook error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
}
