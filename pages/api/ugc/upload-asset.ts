import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import fetch from "node-fetch";
import FormData from "form-data";
import { getUserLogger } from "../../../lib/userLogger";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { file_url, asset_type = "image" } = req.body;

  if (!file_url) {
    return res.status(400).json({ error: "file_url is required" });
  }

  let logger: any = null;

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

    logger = getUserLogger(user.id);
    logger.info(`[HeyGen] Uploading asset for user: ${user.email}`);

    const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
    if (!HEYGEN_API_KEY) {
      throw new Error("HEYGEN_API_KEY not configured");
    }

    // Download the file from the URL
    logger.info(`Downloading asset from: ${file_url}`);
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.statusText}`);
    }

    const fileBuffer = await fileResponse.buffer();
    const contentType = fileResponse.headers.get('content-type') || 'image/jpeg';

    // Determine file extension
    let extension = 'jpg';
    if (contentType.includes('png')) extension = 'png';
    else if (contentType.includes('gif')) extension = 'gif';
    else if (contentType.includes('webp')) extension = 'webp';
    else if (contentType.includes('mp4')) extension = 'mp4';

    // Create form data
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: `asset-${Date.now()}.${extension}`,
      contentType: contentType
    });

    // Upload to HeyGen
    logger.info(`Uploading ${asset_type} to HeyGen (${fileBuffer.length} bytes)...`);
    const uploadResponse = await fetch('https://api.heygen.com/v1/asset', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        ...formData.getHeaders()
      },
      body: formData as any
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error(`HeyGen upload failed: ${uploadResponse.status} - ${errorText}`);
      throw new Error(`HeyGen upload failed: ${uploadResponse.status}`);
    }

    const uploadData: any = await uploadResponse.json();

    if (!uploadData.data || !uploadData.data.asset_id) {
      logger.error(`Invalid response from HeyGen: ${JSON.stringify(uploadData)}`);
      throw new Error("Invalid response from HeyGen - no asset_id");
    }

    const assetId = uploadData.data.asset_id;
    logger.info(`✅ Asset uploaded successfully. Asset ID: ${assetId}`);

    return res.status(200).json({
      asset_id: assetId,
      asset_url: uploadData.data.url,
      asset_type: asset_type
    });

  } catch (error: any) {
    if (logger) {
      logger.error(`Asset upload failed: ${error.message}`);
      logger.error(error.stack);
    }

    return res.status(500).json({
      error: "Failed to upload asset",
      details: error.message
    });
  }
}
