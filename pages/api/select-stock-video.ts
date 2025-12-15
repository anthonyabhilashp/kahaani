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

  const { scene_id, story_id, download_url, stock_video_id } = req.body;

  if (!scene_id || !story_id || !download_url) {
    return res.status(400).json({ error: 'Missing required fields: scene_id, story_id, download_url' });
  }

  try {
    // Download the video from stock provider
    console.log(`Downloading stock video ${stock_video_id} from ${download_url}`);
    const videoResponse = await fetch(download_url);

    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoData = Buffer.from(videoBuffer);
    console.log(`Downloaded ${(videoData.length / 1024 / 1024).toFixed(2)}MB`);

    // Generate unique filename
    const filename = `stock-${stock_video_id}-${Date.now()}.mp4`;
    const storagePath = `${story_id}/${scene_id}/${filename}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(storagePath, videoData, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload video: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(storagePath);

    // Update scene with video URL
    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        video_url: publicUrl,
      })
      .eq('id', scene_id);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error(`Failed to update scene: ${updateError.message}`);
    }

    console.log(`Stock video saved to scene ${scene_id}: ${publicUrl}`);

    return res.status(200).json({
      success: true,
      video_url: publicUrl,
    });
  } catch (error: any) {
    console.error('Select stock video error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save stock video' });
  }
}
