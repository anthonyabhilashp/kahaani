import type { NextApiRequest, NextApiResponse } from "next";
import { Paddle, EventName } from "@paddle/paddle-node-sdk";
import { addCredits } from "../../../lib/credits";

const paddle = new Paddle(process.env.PADDLE_API_KEY!, {
  environment: (process.env.PADDLE_ENVIRONMENT as "sandbox" | "production") || "sandbox",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get the signature from headers
    const signature = req.headers['paddle-signature'] as string;

    if (!signature) {
      console.error("Missing Paddle signature");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify webhook signature
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET!;
    const eventData = paddle.webhooks.unmarshal(
      JSON.stringify(req.body),
      secretKey,
      signature
    );

    console.log(`✅ Received Paddle event: ${eventData.eventType}`);

    // Handle transaction completed event
    if (eventData.eventType === EventName.TransactionCompleted) {
      const transaction = eventData.data;

      console.log(`💰 Transaction completed: ${transaction.id}`);
      console.log(`   Status: ${transaction.status}`);
      console.log(`   Customer: ${transaction.customerEmail}`);

      if (transaction.status === 'completed') {
        const customData = transaction.customData as any;
        const userId = customData?.user_id;
        const credits = parseInt(customData?.credits || '0');

        if (!userId || !credits) {
          console.error("Missing user_id or credits in custom data");
          return res.status(400).json({ error: "Invalid custom data" });
        }

        console.log(`   Adding ${credits} credits to user ${userId}`);

        // Add credits using existing credits system
        const result = await addCredits(
          userId,
          credits,
          'purchase',
          `Purchased ${credits} credits via Paddle (Transaction: ${transaction.id})`
        );

        if (!result.success) {
          console.error("Failed to add credits");
          return res.status(500).json({ error: "Failed to add credits" });
        }

        console.log(`✅ Successfully added ${credits} credits. New balance: ${result.newBalance}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error(`Paddle webhook error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
}
