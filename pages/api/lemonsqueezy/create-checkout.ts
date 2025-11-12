import type { NextApiRequest, NextApiResponse } from "next";
import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { checkRateLimit, RateLimits } from "../../../lib/rateLimit";

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

    const { credits } = req.body;

    // Validate credits amount
    if (!credits || credits <= 0) {
      return res.status(400).json({ error: "Invalid credits amount" });
    }

    // Validate package is one of the allowed options
    const validPackages = [250, 1000, 3000];
    if (!validPackages.includes(credits)) {
      return res.status(400).json({ error: "Invalid package selected" });
    }

    // Initialize LemonSqueezy
    lemonSqueezySetup({
      apiKey: process.env.LEMONSQUEEZY_API_KEY!,
      onError: (error) => console.error('LemonSqueezy Error:', error),
    });

    // Get variant ID for this package
    const variantId = process.env[`LEMONSQUEEZY_VARIANT_ID_${credits}`];
    console.log(`Credits: ${credits}, Variant ID: ${variantId}`);

    if (!variantId) {
      throw new Error(`Missing LEMONSQUEEZY_VARIANT_ID_${credits} environment variable`);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create checkout using fetch API (LemonSqueezy SDK method)
    const checkoutResponse = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY!}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            store_id: process.env.LEMONSQUEEZY_STORE_ID!,
            variant_id: variantId,
            product_options: {
              redirect_url: `${appUrl}/credits?success=true`
            },
            checkout_options: {
              button_color: '#ea580c'
            },
            checkout_data: {
              email: user.email,
              custom: {
                user_id: user.id,
                credits: credits.toString(),
              }
            }
          }
        }
      })
    });

    if (!checkoutResponse.ok) {
      const errorData = await checkoutResponse.json();
      console.error('LemonSqueezy API error:', errorData);
      throw new Error(`LemonSqueezy checkout creation failed: ${JSON.stringify(errorData)}`);
    }

    const checkoutData = await checkoutResponse.json();
    const checkoutUrl = checkoutData.data.attributes.url;

    console.log(`LemonSqueezy checkout created: ${checkoutUrl}`);

    res.status(200).json({
      checkoutUrl: checkoutUrl,
      checkoutId: checkoutData.data.id
    });
  } catch (err: any) {
    console.error("LemonSqueezy checkout error:", err);
    res.status(500).json({ error: err.message });
  }
}
