import type { NextApiRequest, NextApiResponse } from "next";

const HEYGEN_API = "https://api.heygen.com/v2/voices";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const heygenApiKey = process.env.HEYGEN_API_KEY;
    if (!heygenApiKey) {
      return res.status(500).json({ error: "HeyGen API key not configured" });
    }

    const response = await fetch(HEYGEN_API, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "x-api-key": heygenApiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HeyGen API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: `Failed to fetch voices: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error: any) {
    console.error(`Failed to list voices: ${error.message}`);
    return res.status(500).json({
      error: "Failed to list voices",
      details: error.message
    });
  }
}
