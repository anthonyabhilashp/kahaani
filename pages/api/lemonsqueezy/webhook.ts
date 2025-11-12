import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { addCredits } from "../../../lib/credits";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify webhook signature
    const signature = req.headers['x-signature'] as string;
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;

    if (!signature) {
      console.error("Missing LemonSqueezy signature");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex');

    if (digest !== signature) {
      console.error("Invalid LemonSqueezy signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.body;
    const eventName = event.meta.event_name;

    console.log(`✅ Received LemonSqueezy event: ${eventName}`);

    // Handle order created event
    if (eventName === 'order_created') {
      const order = event.data;
      const customData = order.attributes.first_order_item.product_name;

      // Extract custom data
      const userId = order.attributes.checkout_data?.custom?.user_id;
      const credits = parseInt(order.attributes.checkout_data?.custom?.credits || '0');

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
