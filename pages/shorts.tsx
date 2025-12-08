import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Video, Trash2, Clock, Scissors, Youtube } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type SourceVideo = {
  id: string;
  title: string | null;
  created_at: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  shorts_count: number;
};

export default function ShortsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [sourceVideos, setSourceVideos] = useState<SourceVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch source videos from cut_short_videos table
  const fetchSourceVideos = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cut_short_videos")
        .select("id, title, created_at, video_url, thumbnail_url, duration")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get shorts count for each video
      const videosWithShortCount = await Promise.all(
        (data || []).map(async (video: any) => {
          const { count } = await supabase
            .from("shorts")
            .select("*", { count: "exact", head: true })
            .eq("parent_video_id", video.id);

          return {
            id: video.id,
            title: video.title,
            created_at: video.created_at,
            video_url: video.video_url,
            thumbnail_url: video.thumbnail_url,
            duration: video.duration,
            shorts_count: count || 0
          };
        })
      );

      setSourceVideos(videosWithShortCount);
    } catch (err: any) {
      console.error("Error fetching source videos:", err);
      toast({
        title: "Error",
        description: "Failed to load source videos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSourceVideos();
    }
  }, [user]);

  // Handle video upload
  const handleVideoUpload = async (file: File) => {
    if (!user) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("video", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));

      const uploadRes = await fetch("/api/cut-short-videos/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (!uploadRes.ok) {
        const error = await uploadRes.json();
        throw new Error(error.error || "Failed to upload video");
      }

      toast({
        title: "Success",
        description: "Video uploaded successfully"
      });

      setUploadDialogOpen(false);
      fetchSourceVideos();
    } catch (err: any) {
      console.error("Error uploading video:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to upload video",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  // Handle YouTube import
  const handleYouTubeImport = async () => {
    if (!user || !youtubeUrl.trim()) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const importRes = await fetch("/api/shorts/import-youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          youtube_url: youtubeUrl,
          title: "YouTube Import"
        })
      });

      if (!importRes.ok) {
        const error = await importRes.json();
        throw new Error(error.error || "Failed to import video");
      }

      toast({
        title: "Success",
        description: "YouTube video imported successfully"
      });

      setImportDialogOpen(false);
      setYoutubeUrl("");
      fetchSourceVideos();
    } catch (err: any) {
      console.error("Error importing YouTube video:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to import YouTube video",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  // Handle delete source video
  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm("Are you sure you want to delete this video and all its shorts?")) return;

    try {
      // 1️⃣ Get the video record first to get file URLs
      const video = sourceVideos.find(v => v.id === videoId);

      // 2️⃣ Delete files from Supabase Storage
      if (video?.video_url) {
        // Extract path from URL: .../storage/v1/object/public/videos/userId/filename.mp4
        const videoPath = video.video_url.split('/storage/v1/object/public/videos/')[1];
        if (videoPath) {
          await supabase.storage.from("videos").remove([videoPath]);
        }
      }

      if (video?.thumbnail_url) {
        // Extract path from URL: .../storage/v1/object/public/images/userId/filename.jpg
        const thumbnailPath = video.thumbnail_url.split('/storage/v1/object/public/images/')[1];
        if (thumbnailPath) {
          await supabase.storage.from("images").remove([thumbnailPath]);
        }
      }

      // 3️⃣ Delete the database record (shorts cascade automatically via foreign key)
      const { error } = await supabase
        .from("cut_short_videos")
        .delete()
        .eq("id", videoId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Video deleted successfully"
      });

      fetchSourceVideos();
    } catch (err: any) {
      console.error("Error deleting video:", err);
      toast({
        title: "Error",
        description: "Failed to delete video",
        variant: "destructive"
      });
    }
  };

  // Format duration helper
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                ← Stories
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Scissors className="w-6 h-6 text-orange-600" />
              Cut Shorts
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setImportDialogOpen(true)}
              variant="outline"
              className="border-gray-700 hover:border-orange-600"
            >
              <Youtube className="w-4 h-4 mr-2" />
              Import YouTube
            </Button>
            <Button
              onClick={() => setUploadDialogOpen(true)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Video
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {sourceVideos.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-800 max-w-2xl mx-auto">
            <CardContent className="p-12 text-center">
              <Scissors className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Source Videos</h2>
              <p className="text-gray-400 mb-6">
                Upload a video or import from YouTube to start cutting shorts
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => setUploadDialogOpen(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Video
                </Button>
                <Button
                  onClick={() => setImportDialogOpen(true)}
                  variant="outline"
                  className="border-gray-700 hover:border-orange-600"
                >
                  <Youtube className="w-4 h-4 mr-2" />
                  Import YouTube
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sourceVideos.map((video) => (
              <Card
                key={video.id}
                onClick={() => router.push(`/shorts/${video.id}`)}
                className="bg-gray-900/50 border-gray-800 hover:border-orange-600 cursor-pointer transition-all group overflow-hidden"
              >
                <div className="aspect-video relative bg-gray-800">
                  {video.thumbnail_url ? (
                    <Image
                      src={video.thumbnail_url}
                      alt={video.title || "Video"}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-12 h-12 text-gray-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-center">
                      <Scissors className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                      <p className="text-sm font-semibold">Cut Shorts</p>
                    </div>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold truncate mb-2">{video.title || "Untitled Video"}</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDuration(video.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Scissors className="w-4 h-4" />
                      {video.shorts_count} shorts
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteVideo(video.id);
                    }}
                    className="mt-2 w-full text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle>Upload Video</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Upload a video file to cut into shorts. Supported formats: MP4, MOV, AVI
            </p>
            <Input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoUpload(file);
              }}
              disabled={uploading}
              className="bg-gray-800 border-gray-700"
            />
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import YouTube Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle>Import from YouTube</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Enter a YouTube URL to import and cut into shorts
            </p>
            <Input
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={uploading}
              className="bg-gray-800 border-gray-700"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(false)}
                disabled={uploading}
                className="border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleYouTubeImport}
                disabled={uploading || !youtubeUrl.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Youtube className="w-4 h-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
