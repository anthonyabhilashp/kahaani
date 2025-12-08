import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Get the video to find storage paths
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("cut_short_videos")
      .select("id, user_id, audio_url, video_url, thumbnail_url")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Extract storage paths from URLs and delete from storage
    const deleteFromStorage = async (url: string | null, bucket: string) => {
      if (!url) return;

      // URL format: https://xxx.supabase.co/storage/v1/object/public/BUCKET/PATH
      const match = url.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`));
      if (match) {
        const filePath = match[1];
        console.log(`🗑️ Deleting from ${bucket}: ${filePath}`);
        const { error } = await supabaseAdmin.storage.from(bucket).remove([filePath]);
        if (error) {
          console.error(`Failed to delete ${filePath} from ${bucket}:`, error.message);
        }
      }
    };

    // Delete audio file
    await deleteFromStorage(video.audio_url, "audio");

    // Delete video file (if uploaded directly)
    await deleteFromStorage(video.video_url, "videos");

    // Delete thumbnail (if stored in our storage)
    if (video.thumbnail_url && !video.thumbnail_url.includes("img.youtube.com")) {
      await deleteFromStorage(video.thumbnail_url, "images");
    }

    // Delete all shorts associated with this video
    const { error: shortsDeleteError } = await supabaseAdmin
      .from("shorts")
      .delete()
      .eq("parent_video_id", id);

    if (shortsDeleteError) {
      console.error("Failed to delete shorts:", shortsDeleteError.message);
    }

    // Delete the video record
    const { error: deleteError } = await supabaseAdmin
      .from("cut_short_videos")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`✅ Deleted cut_short_video ${id} and all related assets`);

    return res.status(200).json({ success: true });

  } catch (err: any) {
    console.error("Error deleting video:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
