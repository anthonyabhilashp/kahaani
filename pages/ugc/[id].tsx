import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Slider } from "../../components/ui/slider";
import { Label } from "../../components/ui/label";
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Loader2,
  Upload,
  Sparkles,
  User,
  Mic,
  Image as ImageIcon,
  Video as VideoIcon,
  Layers,
  Settings
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";

type UGCVideo = {
  id: string;
  user_id: string;
  title: string;
  product_name: string | null;
  product_description: string | null;
  script_text: string | null;
  avatar_id: string | null;
  voice_id: string | null;
  video_url: string | null;
  background_video_url: string | null;
  background_video_type: string | null;
  overlay_enabled: boolean;
  overlay_position: string;
  overlay_size: number;
  status: string;
  created_at: string;
};

type Avatar = {
  avatar_id: string;
  avatar_name: string;
  preview_image_url: string;
};

type Voice = {
  voice_id: string;
  voice_name: string;
  language: string;
  gender: string;
};

export default function UGCVideoEditor() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  // State
  const [ugcVideo, setUgcVideo] = useState<UGCVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<"script" | "avatar" | "voice" | "background" | "overlay">("script");
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");

  // Script editing
  const [editedTitle, setEditedTitle] = useState("");
  const [editedProductName, setEditedProductName] = useState("");
  const [editedProductDescription, setEditedProductDescription] = useState("");
  const [editedScript, setEditedScript] = useState("");

  // Avatar & Voice
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Background video
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string>("");
  const [uploadingBackground, setUploadingBackground] = useState(false);

  // Overlay settings
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayPosition, setOverlayPosition] = useState<string>("bottom-right");
  const [overlaySize, setOverlaySize] = useState(35);

  // Video generation
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  // Preview
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch UGC video details
  useEffect(() => {
    if (!id || !user) return;

    async function fetchUGCVideo() {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('ugc_videos')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        if (data.user_id !== user.id) {
          toast({
            title: "Unauthorized",
            description: "You don't have access to this UGC video.",
            variant: "destructive"
          });
          router.push('/');
          return;
        }

        setUgcVideo(data);
        setEditedTitle(data.title || "");
        setEditedProductName(data.product_name || "");
        setEditedProductDescription(data.product_description || "");
        setEditedScript(data.script_text || "");
        setSelectedAvatarId(data.avatar_id || "");
        setSelectedVoiceId(data.voice_id || "");
        setOverlayEnabled(data.overlay_enabled ?? true);
        setOverlayPosition(data.overlay_position || "bottom-right");
        setOverlaySize(data.overlay_size || 35);
        setBackgroundPreview(data.background_video_url || "");

      } catch (error: any) {
        console.error("Error fetching UGC video:", error);
        toast({
          title: "Error",
          description: "Failed to load UGC video",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    }

    fetchUGCVideo();
  }, [id, user]);

  // Fetch avatars
  useEffect(() => {
    async function fetchAvatars() {
      try {
        setLoadingAvatars(true);

        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;

        const response = await fetch('/api/ugc/list-avatars', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch avatars');

        const data = await response.json();
        setAvatars(data.avatars || []);

      } catch (error: any) {
        console.error("Error fetching avatars:", error);
        toast({
          title: "Error",
          description: "Failed to load avatars",
          variant: "destructive"
        });
      } finally {
        setLoadingAvatars(false);
      }
    }

    if (leftPanelView === 'avatar') {
      fetchAvatars();
    }
  }, [leftPanelView]);

  // Fetch voices
  useEffect(() => {
    async function fetchVoices() {
      try {
        setLoadingVoices(true);

        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;

        const response = await fetch('/api/ugc/list-voices', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch voices');

        const data = await response.json();
        setVoices(data.voices || []);

      } catch (error: any) {
        console.error("Error fetching voices:", error);
        toast({
          title: "Error",
          description: "Failed to load voices",
          variant: "destructive"
        });
      } finally {
        setLoadingVoices(false);
      }
    }

    if (leftPanelView === 'voice') {
      fetchVoices();
    }
  }, [leftPanelView]);

  // Save script
  async function handleSaveScript() {
    if (!id) return;

    try {
      const { error } = await supabase
        .from('ugc_videos')
        .update({
          title: editedTitle,
          product_name: editedProductName,
          product_description: editedProductDescription,
          script_text: editedScript
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Script saved successfully"
      });

      setUgcVideo(prev => prev ? {
        ...prev,
        title: editedTitle,
        product_name: editedProductName,
        product_description: editedProductDescription,
        script_text: editedScript
      } : null);

    } catch (error: any) {
      console.error("Error saving script:", error);
      toast({
        title: "Error",
        description: "Failed to save script",
        variant: "destructive"
      });
    }
  }

  // Save avatar selection
  async function handleSaveAvatar() {
    if (!id || !selectedAvatarId) return;

    try {
      const { error } = await supabase
        .from('ugc_videos')
        .update({ avatar_id: selectedAvatarId })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Avatar saved successfully"
      });

      setUgcVideo(prev => prev ? { ...prev, avatar_id: selectedAvatarId } : null);

    } catch (error: any) {
      console.error("Error saving avatar:", error);
      toast({
        title: "Error",
        description: "Failed to save avatar",
        variant: "destructive"
      });
    }
  }

  // Save voice selection
  async function handleSaveVoice() {
    if (!id || !selectedVoiceId) return;

    try {
      const { error } = await supabase
        .from('ugc_videos')
        .update({ voice_id: selectedVoiceId })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Voice saved successfully"
      });

      setUgcVideo(prev => prev ? { ...prev, voice_id: selectedVoiceId } : null);

    } catch (error: any) {
      console.error("Error saving voice:", error);
      toast({
        title: "Error",
        description: "Failed to save voice",
        variant: "destructive"
      });
    }
  }

  // Upload background video
  async function handleBackgroundUpload() {
    if (!backgroundFile || !id) return;

    try {
      setUploadingBackground(true);

      // Upload to Supabase Storage
      const fileName = `ugc-background-${id}-${Date.now()}.mp4`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, backgroundFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName);

      // Update database
      const { error: updateError } = await supabase
        .from('ugc_videos')
        .update({
          background_video_url: publicUrl,
          background_video_type: 'uploaded'
        })
        .eq('id', id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Background video uploaded successfully"
      });

      setBackgroundPreview(publicUrl);
      setUgcVideo(prev => prev ? {
        ...prev,
        background_video_url: publicUrl,
        background_video_type: 'uploaded'
      } : null);

    } catch (error: any) {
      console.error("Error uploading background:", error);
      toast({
        title: "Error",
        description: "Failed to upload background video",
        variant: "destructive"
      });
    } finally {
      setUploadingBackground(false);
    }
  }

  // Save overlay settings
  async function handleSaveOverlaySettings() {
    if (!id) return;

    try {
      const { error } = await supabase
        .from('ugc_videos')
        .update({
          overlay_enabled: overlayEnabled,
          overlay_position: overlayPosition,
          overlay_size: overlaySize
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Overlay settings saved"
      });

      setUgcVideo(prev => prev ? {
        ...prev,
        overlay_enabled: overlayEnabled,
        overlay_position: overlayPosition,
        overlay_size: overlaySize
      } : null);

    } catch (error: any) {
      console.error("Error saving overlay settings:", error);
      toast({
        title: "Error",
        description: "Failed to save overlay settings",
        variant: "destructive"
      });
    }
  }

  // Generate avatar video with overlay
  async function handleGenerateVideo() {
    if (!id || !ugcVideo?.script_text || !ugcVideo?.avatar_id || !ugcVideo?.voice_id) {
      toast({
        title: "Missing requirements",
        description: "Please ensure script, avatar, and voice are set",
        variant: "destructive"
      });
      return;
    }

    try {
      setGeneratingVideo(true);
      setVideoProgress(0);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // Step 1: Generate base avatar video
      const avatarResponse = await fetch('/api/ugc/generate-avatar-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ugc_video_id: id,
          avatar_id: ugcVideo.avatar_id,
          voice_id: ugcVideo.voice_id,
          resolution: '720p'
        })
      });

      if (!avatarResponse.ok) {
        const errorData = await avatarResponse.json();
        throw new Error(errorData.error || "Failed to generate avatar video");
      }

      const avatarData = await avatarResponse.json();
      const avatarVideoUrl = avatarData.video_url;

      setVideoProgress(50);

      // Step 2: If background video exists and overlay is enabled, composite them
      if (ugcVideo.background_video_url && overlayEnabled) {
        const compositeResponse = await fetch('/api/ugc/composite-overlay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            ugc_video_id: id,
            background_video_url: ugcVideo.background_video_url,
            avatar_video_url: avatarVideoUrl,
            overlay_position: overlayPosition,
            overlay_size: overlaySize
          })
        });

        if (!compositeResponse.ok) {
          const errorData = await compositeResponse.json();
          throw new Error(errorData.error || "Failed to composite videos");
        }

        const compositeData = await compositeResponse.json();

        toast({
          title: "Success",
          description: "UGC video generated successfully!"
        });

        // Refresh page to show new video
        router.reload();
      } else {
        // No compositing needed, just use avatar video
        const { error: updateError } = await supabase
          .from('ugc_videos')
          .update({
            video_url: avatarVideoUrl,
            status: 'completed'
          })
          .eq('id', id);

        if (updateError) throw updateError;

        toast({
          title: "Success",
          description: "UGC video generated successfully!"
        });

        router.reload();
      }

      setVideoProgress(100);

    } catch (error: any) {
      console.error("Error generating video:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate video",
        variant: "destructive"
      });
    } finally {
      setGeneratingVideo(false);
      setVideoProgress(0);
    }
  }

  // Download video
  async function handleDownloadVideo() {
    if (!ugcVideo?.video_url) return;

    try {
      const response = await fetch(ugcVideo.video_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ugcVideo.title || 'ugc-video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Video download started"
      });
    } catch (error) {
      console.error("Error downloading video:", error);
      toast({
        title: "Error",
        description: "Failed to download video",
        variant: "destructive"
      });
    }
  }

  // Toggle preview playback
  function togglePreview() {
    if (!videoRef.current) return;

    if (isPlayingPreview) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlayingPreview(!isPlayingPreview);
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  if (!ugcVideo) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-400">UGC video not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <header className="flex-shrink-0 bg-black border-b border-gray-800">
        <div className="h-14 md:h-16 px-3 md:px-6 flex items-center justify-between">
          {/* Left: Back button + Title */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/')}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-base md:text-lg font-bold text-white truncate max-w-[150px] md:max-w-none">
                {ugcVideo.title || "Untitled UGC Ad"}
              </h1>
              <p className="text-xs text-gray-400 hidden md:block">
                UGC Video Editor
              </p>
            </div>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2">
            {ugcVideo.video_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadVideo}
                className="text-gray-300 border-gray-700 hover:bg-gray-800"
              >
                <Download className="w-4 h-4" />
                <span className="hidden md:inline ml-2">Download</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleGenerateVideo}
              disabled={generatingVideo || !ugcVideo.script_text || !ugcVideo.avatar_id || !ugcVideo.voice_id}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {generatingVideo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="ml-2">{videoProgress}%</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span className="ml-2">Generate</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Left Sidebar - Tool Icons */}
        <aside className="md:w-20 bg-black border-t md:border-t-0 md:border-r border-gray-800 flex md:flex-col items-center py-2 md:py-6 gap-4 md:gap-6 order-last md:order-first justify-around md:justify-start flex-shrink-0">
          {/* Script Icon */}
          <button
            onClick={() => {
              setLeftPanelView("script");
              setMobileView("editor");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "script" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Script"
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] mt-1">Script</span>
          </button>

          {/* Avatar Icon */}
          <button
            onClick={() => {
              setLeftPanelView("avatar");
              setMobileView("editor");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "avatar" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Avatar"
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] mt-1">Avatar</span>
          </button>

          {/* Voice Icon */}
          <button
            onClick={() => {
              setLeftPanelView("voice");
              setMobileView("editor");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "voice" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Voice"
          >
            <Mic className="w-5 h-5" />
            <span className="text-[10px] mt-1">Voice</span>
          </button>

          {/* Background Icon */}
          <button
            onClick={() => {
              setLeftPanelView("background");
              setMobileView("editor");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "background" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Background"
          >
            <VideoIcon className="w-5 h-5" />
            <span className="text-[10px] mt-1">Background</span>
          </button>

          {/* Overlay Icon */}
          <button
            onClick={() => {
              setLeftPanelView("overlay");
              setMobileView("editor");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "overlay" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Overlay"
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px] mt-1">Overlay</span>
          </button>

          {/* Preview Icon - Mobile only */}
          <button
            className={`md:hidden w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              mobileView === "preview" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setMobileView("preview")}
            title="Preview"
          >
            <Play className="w-5 h-5" />
            <span className="text-[10px] mt-1">Preview</span>
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex bg-black overflow-hidden relative min-h-0">
          {/* Left Editor Panel - 50% width on desktop */}
          <div className={`${mobileView === 'editor' ? 'flex' : 'hidden'} md:flex md:w-[50%] border-r border-gray-800 bg-black flex-col w-full min-h-0`}>
            <div className="flex-1 overflow-y-auto p-6">
              {/* Script Editor */}
              {leftPanelView === "script" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white">Script & Details</h2>

                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      placeholder="UGC Ad Title"
                      className="mt-1 bg-gray-900 border-gray-700 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="productName">Product Name</Label>
                    <Input
                      id="productName"
                      value={editedProductName}
                      onChange={(e) => setEditedProductName(e.target.value)}
                      placeholder="Product Name"
                      className="mt-1 bg-gray-900 border-gray-700 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="productDesc">Product Description</Label>
                    <Textarea
                      id="productDesc"
                      value={editedProductDescription}
                      onChange={(e) => setEditedProductDescription(e.target.value)}
                      placeholder="Brief description of your product..."
                      rows={3}
                      className="mt-1 bg-gray-900 border-gray-700 text-white resize-none"
                    />
                  </div>

                  <div>
                    <Label htmlFor="script">Script</Label>
                    <Textarea
                      id="script"
                      value={editedScript}
                      onChange={(e) => setEditedScript(e.target.value)}
                      placeholder="Avatar will speak this script..."
                      rows={8}
                      className="mt-1 bg-gray-900 border-gray-700 text-white resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {editedScript.length} characters
                    </p>
                  </div>

                  <Button
                    onClick={handleSaveScript}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    Save Script
                  </Button>
                </div>
              )}

              {/* Avatar Selector */}
              {leftPanelView === "avatar" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white">Choose Avatar</h2>

                  {loadingAvatars ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                        {avatars.map((avatar) => (
                          <button
                            key={avatar.avatar_id}
                            onClick={() => setSelectedAvatarId(avatar.avatar_id)}
                            className={`relative rounded overflow-hidden transition-all ${
                              selectedAvatarId === avatar.avatar_id
                                ? 'ring-2 ring-orange-600'
                                : 'hover:ring-2 hover:ring-gray-600'
                            }`}
                          >
                            <img
                              src={avatar.preview_image_url}
                              alt={avatar.avatar_name}
                              className="w-full aspect-[3/4] object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-xs text-white font-medium truncate">
                                {avatar.avatar_name}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>

                      <Button
                        onClick={handleSaveAvatar}
                        disabled={!selectedAvatarId}
                        className="w-full bg-orange-600 hover:bg-orange-700"
                      >
                        Save Avatar
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Voice Selector */}
              {leftPanelView === "voice" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white">Choose Voice</h2>

                  {loadingVoices ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {voices.map((voice) => (
                          <button
                            key={voice.voice_id}
                            onClick={() => setSelectedVoiceId(voice.voice_id)}
                            className={`w-full p-3 rounded-lg border transition-all text-left ${
                              selectedVoiceId === voice.voice_id
                                ? 'bg-orange-900/20 border-orange-600'
                                : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                            }`}
                          >
                            <p className="text-sm font-medium text-white">
                              {voice.voice_name}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {voice.language} • {voice.gender}
                            </p>
                          </button>
                        ))}
                      </div>

                      <Button
                        onClick={handleSaveVoice}
                        disabled={!selectedVoiceId}
                        className="w-full bg-orange-600 hover:bg-orange-700"
                      >
                        Save Voice
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Background Video Upload */}
              {leftPanelView === "background" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white">Background Video</h2>
                  <p className="text-sm text-gray-400">
                    Upload a product video to use as the background
                  </p>

                  {backgroundPreview && (
                    <div className="relative rounded-lg overflow-hidden bg-gray-900">
                      <video
                        src={backgroundPreview}
                        className="w-full aspect-video object-cover"
                        muted
                        playsInline
                        controls
                      />
                    </div>
                  )}

                  <div>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setBackgroundFile(file);
                          setBackgroundPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                      id="background-upload"
                    />
                    <label htmlFor="background-upload">
                      <Button
                        variant="outline"
                        className="w-full"
                        asChild
                      >
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          Choose Video File
                        </span>
                      </Button>
                    </label>
                  </div>

                  {backgroundFile && (
                    <Button
                      onClick={handleBackgroundUpload}
                      disabled={uploadingBackground}
                      className="w-full bg-orange-600 hover:bg-orange-700"
                    >
                      {uploadingBackground ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Uploading...
                        </>
                      ) : (
                        "Upload Background"
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Overlay Settings */}
              {leftPanelView === "overlay" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white">Overlay Settings</h2>
                  <p className="text-sm text-gray-400">
                    Configure how the avatar appears over the background video
                  </p>

                  <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                    <span className="text-sm text-white">Enable Overlay</span>
                    <button
                      onClick={() => setOverlayEnabled(!overlayEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        overlayEnabled ? 'bg-orange-600' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          overlayEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <Label>Position</Label>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setOverlayPosition(pos)}
                          className={`py-2 px-3 rounded text-xs transition-all ${
                            overlayPosition === pos
                              ? 'bg-orange-600 text-white'
                              : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                          }`}
                        >
                          {pos.split('-').join(' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Size: {overlaySize}%</Label>
                    <Slider
                      value={[overlaySize]}
                      onValueChange={(value) => setOverlaySize(value[0])}
                      min={20}
                      max={50}
                      step={5}
                      className="mt-2"
                    />
                  </div>

                  <Button
                    onClick={handleSaveOverlaySettings}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    Save Settings
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right Preview Panel - 50% width on desktop */}
          <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 md:w-[50%] bg-black w-full flex-col relative overflow-hidden`}>
            <div className="flex-1 flex items-center justify-center p-6">
              {ugcVideo.video_url ? (
                <div className="relative max-w-full max-h-full">
                  <video
                    ref={videoRef}
                    src={ugcVideo.video_url}
                    className="max-w-full max-h-full rounded-lg"
                    controls
                    onPlay={() => setIsPlayingPreview(true)}
                    onPause={() => setIsPlayingPreview(false)}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <VideoIcon className="w-16 h-16 mb-4" />
                  <p className="text-sm">No video generated yet</p>
                  <p className="text-xs mt-2 text-center max-w-xs">
                    Configure your script, avatar, voice, and background, then click Generate
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
