import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { scene_id, story_id, download_url, stock_photo_id } = req.body;

  if (!scene_id || !story_id || !download_url) {
    return res.status(400).json({ error: 'Missing required fields: scene_id, story_id, download_url' });
  }

  try {
    // Download the photo from stock provider
    console.log(`Downloading stock photo ${stock_photo_id} from ${download_url}`);
    const photoResponse = await fetch(download_url);

    if (!photoResponse.ok) {
      throw new Error(`Failed to download photo: ${photoResponse.status}`);
    }

    const photoBuffer = await photoResponse.arrayBuffer();
    const photoData = Buffer.from(photoBuffer);

    // Determine content type from URL
    const extension = download_url.split('.').pop()?.split('?')[0] || 'jpg';
    const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';

    // Generate unique filename
    const filename = `stock-${stock_photo_id}-${Date.now()}.${extension}`;
    const storagePath = `${story_id}/${scene_id}/${filename}`;

    // Upload to Supabase Storage (images bucket)
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(storagePath, photoData, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload photo: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(storagePath);

    // Update scene with image URL
    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        image_url: publicUrl,
      })
      .eq('id', scene_id);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error(`Failed to update scene: ${updateError.message}`);
    }

    console.log(`Stock photo saved to scene ${scene_id}: ${publicUrl}`);

    return res.status(200).json({
      success: true,
      image_url: publicUrl,
    });
  } catch (error: any) {
    console.error('Select stock photo error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save stock photo' });
  }
}
