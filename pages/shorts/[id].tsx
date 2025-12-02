import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Loader2, Scissors, Play, Pause, Volume2, VolumeX, Music, Type, HelpCircle, Upload, Download, Trash2, ChevronUp, ChevronDown, Edit2, Save } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import { getFontsByCategory } from "@/lib/fonts";
import { Slider } from "@/components/ui/slider";
import * as SliderPrimitive from "@radix-ui/react-slider";

type Scene = {
  id?: string;
  text: string;
  order: number;
  video_url?: string;
  audio_url?: string;
  duration?: number;
  word_timestamps?: Array<{ word: string; start: number; end: number }> | null;
};

type ShortSuggestion = {
  id: string;
  start_time: number;
  end_time: number;
  duration: number;
  title: string;
  hook_line?: string;
  score?: number;
  reason: string;
  video_url?: string;
  thumbnail_url?: string;
};

export default function ShortsPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [story, setStory] = useState<any>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingShorts, setAnalyzingShorts] = useState(false);
  const [shortsSuggestions, setShortsSuggestions] = useState<ShortSuggestion[]>([]);
  const [selectedShortId, setSelectedShortId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [editingShortId, setEditingShortId] = useState<string | null>(null);
  const [updatingShortId, setUpdatingShortId] = useState<string | null>(null);
  const [playingPreviews, setPlayingPreviews] = useState<Set<string>>(new Set());
  const [previewVolumes, setPreviewVolumes] = useState<Map<string, number>>(new Map());

  // Video player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Left panel view state
  const [leftPanelView, setLeftPanelView] = useState<"shorts" | "captions" | "background_music">("shorts");

  // Caption settings (matching story editor exactly)
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionPositionFromBottom, setCaptionPositionFromBottom] = useState(20);
  const [captionFontSize, setCaptionFontSize] = useState(18);
  const [captionFontWeight, setCaptionFontWeight] = useState(600);
  const [captionFontFamily, setCaptionFontFamily] = useState("Montserrat");
  const [captionActiveColor, setCaptionActiveColor] = useState("#02f7f3");
  const [captionInactiveColor, setCaptionInactiveColor] = useState("#FFFFFF");
  const [captionWordsPerBatch, setCaptionWordsPerBatch] = useState(3);
  const [captionTextTransform, setCaptionTextTransform] = useState<"none" | "uppercase" | "lowercase" | "capitalize">("none");

  // Background music settings (matching story editor)
  const [bgMusicId, setBgMusicId] = useState<string | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(30);
  const [musicLibrary, setMusicLibrary] = useState<any[]>([]);
  const [musicLibraryLoading, setMusicLibraryLoading] = useState(false);
  const [bgMusicUploading, setBgMusicUploading] = useState(false);
  const [musicPreviewPlaying, setMusicPreviewPlaying] = useState<string | null>(null);
  const bgMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicPreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch story details
  useEffect(() => {
    if (!id) return;
    fetchStory();
  }, [id]);

  // Fetch shorts when scene is loaded
  useEffect(() => {
    if (scene?.id) {
      fetchShorts();
    }
  }, [scene?.id]);

  const fetchStory = async () => {
    if (!id) return;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: any = session
        ? { "Authorization": `Bearer ${session.access_token}` }
        : {};

      const res = await fetch(`/api/get_story_details?id=${id}`, { headers });
      const data = await res.json();

      setStory(data.story);
      setScene(data.scenes?.[0] || null);

      // Load caption settings from DB
      if (data.story?.caption_settings) {
        const settings = data.story.caption_settings;
        setCaptionsEnabled(settings.enabled ?? true);
        setCaptionFontFamily(settings.font || "Montserrat");
        setCaptionFontSize(settings.size || 18);
        setCaptionInactiveColor(settings.color || "#FFFFFF");
        setCaptionActiveColor(settings.highlightColor || "#02f7f3");
      }

      // Load background music settings
      if (data.story?.background_music_settings) {
        const bgSettings = data.story.background_music_settings;
        setBgMusicId(bgSettings.music_id || null);
        setBgMusicVolume(bgSettings.volume ?? 30);
      }
    } catch (err: any) {
      console.error("Error fetching story:", err);
      toast({
        title: "Error",
        description: "Failed to load story details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchShorts = async () => {
    if (!scene?.id) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: any = session
        ? { "Authorization": `Bearer ${session.access_token}` }
        : {};

      const res = await fetch(`/api/get_shorts?scene_id=${scene.id}`, { headers });
      const data = await res.json();

      if (data.success && data.shorts) {
        setShortsSuggestions(data.shorts);
      }
    } catch (err: any) {
      console.error("Error fetching shorts:", err);
      // Don't show error toast - shorts might not exist yet
    }
  };

  const updateShortTiming = async (shortId: string, start_time: number, end_time: number) => {
    setUpdatingShortId(shortId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch("/api/update_short", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          short_id: shortId,
          start_time,
          end_time
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update short");
      }

      const data = await response.json();

      // Update local state
      setShortsSuggestions(prev =>
        prev.map(s => s.id === shortId ? data.short : s)
      );

      setEditingShortId(null);

      toast({
        title: "Updated!",
        description: "Short timing updated successfully"
      });
    } catch (err: any) {
      console.error("Error updating short:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update short",
        variant: "destructive"
      });
    } finally {
      setUpdatingShortId(null);
    }
  };

  const adjustShortTiming = (shortId: string, field: 'start_time' | 'end_time', delta: number) => {
    setShortsSuggestions(prev =>
      prev.map(s => {
        if (s.id !== shortId) return s;

        const newValue = s[field] + delta;
        const maxTime = scene?.duration || 0;

        // Validate bounds
        if (field === 'start_time' && (newValue < 0 || newValue >= s.end_time)) return s;
        if (field === 'end_time' && (newValue <= s.start_time || newValue > maxTime)) return s;

        const updated = { ...s, [field]: newValue };
        updated.duration = updated.end_time - updated.start_time;
        return updated;
      })
    );
  };

  // Fetch music library
  useEffect(() => {
    if (user?.id) {
      fetchMusicLibrary();
    }
  }, [user]);

  const fetchMusicLibrary = async () => {
    setMusicLibraryLoading(true);
    try {
      const res = await fetch(`/api/music/library?user_id=${user?.id}`);
      const data = await res.json();
      setMusicLibrary(data.music || []);
    } catch (err) {
      console.error("Error fetching music library:", err);
    } finally {
      setMusicLibraryLoading(false);
    }
  };

  const handleSelectMusicFromLibrary = (music: any) => {
    setBgMusicId(music.id);
    toast({ description: `Selected: ${music.name}` });
  };

  const toggleMusicPreview = (music: any) => {
    if (musicPreviewPlaying === music.id) {
      musicPreviewAudioRef.current?.pause();
      setMusicPreviewPlaying(null);
    } else {
      if (musicPreviewAudioRef.current) {
        musicPreviewAudioRef.current.pause();
      }
      const audio = new Audio(music.file_url);
      musicPreviewAudioRef.current = audio;
      audio.play();
      setMusicPreviewPlaying(music.id);
      audio.onended = () => setMusicPreviewPlaying(null);
    }
  };

  const handleDeleteMusic = async (music: any) => {
    if (!confirm(`Delete "${music.name}"?`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/music/library?id=${music.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        }
      });

      if (!res.ok) throw new Error("Delete failed");

      setMusicLibrary(prev => prev.filter(m => m.id !== music.id));
      if (bgMusicId === music.id) setBgMusicId(null);

      toast({ description: "Music deleted successfully" });
    } catch (err) {
      console.error("Delete error:", err);
      toast({ description: "Failed to delete music", variant: "destructive" });
    }
  };

  const analyzeShorts = async () => {
    if (!id || typeof id !== 'string') return;
    if (!scene?.id) {
      toast({
        title: "Error",
        description: "No video found to analyze",
        variant: "destructive"
      });
      return;
    }

    setAnalyzingShorts(true);
    setShortsSuggestions([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch("/api/analyze_shorts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          story_id: id,
          scene_id: scene.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to analyze video");
      }

      const data = await response.json();
      setShortsSuggestions(data.shorts || []);

      if (data.shorts && data.shorts.length > 0) {
        toast({
          title: "Analysis Complete!",
          description: `Found ${data.shorts.length} potential shorts`
        });
      } else {
        toast({
          title: "No shorts found",
          description: "AI couldn't identify good segments in this video",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      console.error("Error analyzing shorts:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to analyze video",
        variant: "destructive"
      });
    } finally {
      setAnalyzingShorts(false);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    const audio = audioRef.current;

    if (isPlaying) {
      videoRef.current.pause();
      if (audio) {
        audio.pause();
      }
    } else {
      videoRef.current.play();
      if (audio) {
        audio.play();
      }
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const audio = audioRef.current;
    const newMuted = !isMuted;

    videoRef.current.muted = newMuted;
    if (audio) {
      audio.muted = newMuted;
    }

    setIsMuted(newMuted);
    if (newMuted) {
      setVolume(0);
    } else {
      setVolume(0.7);
      videoRef.current.volume = 0.7;
      if (audio) {
        audio.volume = 0.7;
      }
    }
  };

  const playShort = (short: ShortSuggestion) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const audio = audioRef.current;

    // Set selected short
    setSelectedShortId(short.id);

    // Unmute and set volume if muted or volume is 0
    if (isMuted || volume === 0) {
      video.muted = false;
      video.volume = 0.7;
      setIsMuted(false);
      setVolume(0.7);
    }

    // Seek to start time for both video and audio
    video.currentTime = short.start_time;
    if (audio) {
      audio.currentTime = short.start_time;
      audio.volume = 0.7;
      audio.muted = false;
    }

    // Play both video and audio
    video.play();
    if (audio) {
      audio.play();
    }
    setIsPlaying(true);

    // Add timeupdate listener to stop at end time
    const handleTimeUpdate = () => {
      if (video.currentTime >= short.end_time) {
        video.pause();
        if (audio) {
          audio.pause();
        }
        setIsPlaying(false);
        video.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    // Cleanup on unmount or when playing another short
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  // Get preview dimensions based on aspect ratio
  const getPreviewDimensions = () => {
    switch (aspectRatio) {
      case "9:16": // Portrait (mobile/vertical)
        return { width: 280, height: 498 }; // 9:16 ratio, compact
      case "16:9": // Landscape (desktop/horizontal)
        return { width: 498, height: 280 }; // 16:9 ratio, compact
      case "1:1": // Square
        return { width: 400, height: 400 }; // 1:1 ratio, compact
    }
  };

  const previewDimensions = getPreviewDimensions();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to All Stories</span>
          </button>
          <div className="h-6 w-px bg-gray-700"></div>
          <h1 className="text-xl font-semibold">{story?.title || 'Untitled'}</h1>
        </div>

        {/* Video Stats & Controls */}
        <div className="flex items-center gap-6">
          {/* Video Duration */}
          <div className="text-sm text-gray-400">
            Duration: <span className="text-white font-medium">{scene?.duration ? formatTime(scene.duration) : 'Unknown'}</span>
          </div>

          {/* Aspect Ratio Selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">Format:</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as "9:16" | "16:9" | "1:1")}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            >
              <option value="9:16">9:16 (Portrait)</option>
              <option value="16:9">16:9 (Landscape)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Icon Navigation */}
        <aside className="w-16 bg-gray-950 border-r border-gray-800 flex flex-col items-center py-4 gap-6">
          <button
            onClick={() => setLeftPanelView("shorts")}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${
              leftPanelView === "shorts" ? "text-orange-400" : "text-gray-400 hover:text-white"
            }`}
          >
            <Scissors className="w-5 h-5" />
            <span className="text-[10px]">Shorts</span>
          </button>

          <button
            onClick={() => setLeftPanelView("captions")}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${
              leftPanelView === "captions" ? "text-orange-400" : "text-gray-400 hover:text-white"
            }`}
          >
            <Type className="w-5 h-5" />
            <span className="text-[10px]">Captions</span>
          </button>

          <button
            onClick={() => setLeftPanelView("background_music")}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${
              leftPanelView === "background_music" ? "text-orange-400" : "text-gray-400 hover:text-white"
            }`}
          >
            <Music className="w-5 h-5" />
            <span className="text-[10px]">Music</span>
          </button>
        </aside>

        {/* Main Content Panel - Full width */}
        <div className="flex-1 bg-black flex flex-col overflow-hidden">
          {leftPanelView === "shorts" ? (
            <>
              {/* Generate Shorts Button - Only show when no shorts exist */}
              {shortsSuggestions.length === 0 && (
                <div className="p-6 border-b border-gray-800">
                  <button
                    onClick={analyzeShorts}
                    disabled={analyzingShorts || !scene?.video_url}
                    title={
                      !scene?.video_url
                        ? "No video available to analyze"
                        : "Analyze video to find best short clips"
                    }
                    className="w-full flex items-center justify-center gap-2 h-12 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    {analyzingShorts ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing Video...
                      </>
                    ) : (
                      <>
                        <Scissors className="w-5 h-5" />
                        Generate Shorts
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Shorts Suggestions - Vertical List */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 md:px-6 py-4">
                {shortsSuggestions.length > 0 ? (
                  <div className="h-full flex flex-col">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                    {shortsSuggestions.map((short, index) => (
                      <div
                        key={short.id || index}
                        className={`w-full bg-gray-900 rounded-lg border transition-all hover:shadow-xl ${
                          selectedShortId === short.id
                            ? 'border-orange-500 bg-orange-500/5'
                            : 'border-gray-800 hover:border-orange-500'
                        }`}
                      >
                        {/* Video Preview */}
                        <div
                          className="relative rounded-t-lg overflow-hidden bg-black flex items-center justify-center group"
                          style={{
                            width: '100%',
                            height: window.innerWidth < 768 ? '600px' : '400px',
                          }}
                        >
                          <video
                            src={scene?.video_url}
                            data-short-id={short.id}
                            style={{
                              ...(window.innerWidth >= 768 && {
                                aspectRatio: aspectRatio === '1:1' ? '1/1' : aspectRatio === '9:16' ? '9/16' : '16/9',
                              }),
                              maxWidth: '100%',
                              maxHeight: '100%',
                            }}
                            className="object-cover"
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            onTimeUpdate={(e) => {
                              const video = e.currentTarget;
                              if (video.currentTime >= short.end_time) {
                                video.currentTime = short.start_time;
                                // Also sync audio
                                const audio = document.querySelector(`audio[data-short-id="${short.id}"]`) as HTMLAudioElement;
                                if (audio) audio.currentTime = short.start_time;
                              }
                            }}
                          />

                          {/* Audio element for narration */}
                          {scene?.audio_url && (
                            <audio
                              src={scene.audio_url}
                              data-short-id={short.id}
                              muted={!(previewVolumes.get(short.id) ?? 0 > 0)}
                              loop
                              preload="metadata"
                            />
                          )}

                          {/* Video Controls Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 transition-opacity duration-200 flex flex-col justify-end p-4">
                            {/* Controls at bottom - grouped together like story page */}
                            <div className="flex items-center justify-center gap-4">
                              {/* Play/Pause */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const video = document.querySelector(`video[data-short-id="${short.id}"]`) as HTMLVideoElement;
                                  const audio = document.querySelector(`audio[data-short-id="${short.id}"]`) as HTMLAudioElement;
                                  if (!video) return;

                                  if (playingPreviews.has(short.id)) {
                                    // Pause this video
                                    video.pause();
                                    if (audio) audio.pause();
                                    setPlayingPreviews(new Set());
                                  } else {
                                    // Stop all other videos first
                                    playingPreviews.forEach(id => {
                                      const otherVideo = document.querySelector(`video[data-short-id="${id}"]`) as HTMLVideoElement;
                                      const otherAudio = document.querySelector(`audio[data-short-id="${id}"]`) as HTMLAudioElement;
                                      if (otherVideo) otherVideo.pause();
                                      if (otherAudio) otherAudio.pause();
                                    });

                                    // Play this video
                                    video.currentTime = short.start_time;
                                    if (audio) audio.currentTime = short.start_time;
                                    video.play();
                                    if (audio) audio.play();
                                    setPlayingPreviews(new Set([short.id]));
                                  }
                                }}
                                className="w-10 h-10 flex items-center justify-center bg-orange-500/90 hover:bg-orange-600 text-white rounded-full transition-all"
                              >
                                {playingPreviews.has(short.id) ? (
                                  <Pause className="w-5 h-5" />
                                ) : (
                                  <Play className="w-5 h-5 ml-0.5" />
                                )}
                              </button>

                              {/* Volume Control */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const currentVol = previewVolumes.get(short.id) ?? 0;
                                  const newVol = currentVol > 0 ? 0 : 0.7;
                                  setPreviewVolumes(new Map(previewVolumes.set(short.id, newVol)));
                                  const audio = document.querySelector(`audio[data-short-id="${short.id}"]`) as HTMLAudioElement;
                                  if (audio) {
                                    audio.volume = newVol;
                                    audio.muted = newVol === 0;
                                  }
                                }}
                                className="w-10 h-10 flex items-center justify-center bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors"
                              >
                                {(previewVolumes.get(short.id) ?? 0) > 0 ? (
                                  <Volume2 className="w-5 h-5" />
                                ) : (
                                  <VolumeX className="w-5 h-5" />
                                )}
                              </button>
                            </div>
                          </div>
                          {/* Score Badge Overlay */}
                          {short.score && (
                            <div className="absolute top-3 right-3 bg-orange-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg">
                              {short.score}
                            </div>
                          )}
                          {/* Duration Overlay */}
                          <div className="absolute bottom-3 right-3 bg-black/80 text-white px-2 py-1 rounded text-xs font-medium">
                            {(() => {
                              const totalSec = Math.round(short.duration);
                              const hours = Math.floor(totalSec / 3600);
                              const minutes = Math.floor((totalSec % 3600) / 60);
                              const seconds = totalSec % 60;

                              if (hours > 0) {
                                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                              } else {
                                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                              }
                            })()}
                          </div>
                        </div>

                        {/* Short Info */}
                        <div className="p-2">
                          {/* Title */}
                          <h4 className="font-semibold text-white text-xs mb-2 line-clamp-2 leading-snug">
                            {short.title}
                          </h4>
                          {/* Visual Timeline - Shadcn Slider */}
                          {(() => {
                            const videoDuration = scene?.duration || 1;
                            const currentRange = [short.start_time, short.end_time];

                            // Generate time markers
                            const markerInterval = Math.ceil(videoDuration / 8 / 60) * 60;
                            const markers: number[] = [];
                            for (let time = 0; time <= videoDuration; time += markerInterval) {
                              markers.push(time);
                            }
                            if (markers[markers.length - 1] !== videoDuration) {
                              markers.push(videoDuration);
                            }

                            return (
                              <div className="mb-1 space-y-1 px-1">
                                {/* Slider Container */}
                                <div className="relative pt-1 pb-1">
                                  <SliderPrimitive.Root
                                    min={0}
                                    max={videoDuration}
                                    step={0.5}
                                    value={currentRange}
                                    onValueChange={(values) => {
                                      setEditingShortId(short.id);
                                      const [newStart, newEnd] = values;
                                      if (newStart !== short.start_time) {
                                        adjustShortTiming(short.id, 'start_time', newStart - short.start_time);
                                      }
                                      if (newEnd !== short.end_time) {
                                        adjustShortTiming(short.id, 'end_time', newEnd - short.end_time);
                                      }

                                      // Seek video to start position
                                      const videoElement = document.querySelector(`video[data-short-id="${short.id}"]`) as HTMLVideoElement;
                                      if (videoElement) {
                                        videoElement.currentTime = newStart;
                                      }
                                    }}
                                    className="relative flex w-full touch-none select-none items-center cursor-pointer py-3"
                                  >
                                    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-700 cursor-pointer">
                                      <SliderPrimitive.Range className="absolute h-full bg-orange-500" />
                                    </SliderPrimitive.Track>
                                    {/* Start Handle */}
                                    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-white bg-orange-500 shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 disabled:pointer-events-none disabled:opacity-50 hover:scale-110 cursor-grab active:cursor-grabbing active:scale-100" />
                                    {/* End Handle */}
                                    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-white bg-orange-500 shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 disabled:pointer-events-none disabled:opacity-50 hover:scale-110 cursor-grab active:cursor-grabbing active:scale-100" />
                                  </SliderPrimitive.Root>

                                </div>

                                {/* Time Display */}
                                <div className="flex items-center justify-between text-[10px]">
                                  <div>
                                    <span className="text-gray-400">Start: </span>
                                    <span className="font-mono text-white">{formatTime(short.start_time)}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">End: </span>
                                    <span className="font-mono text-white">{formatTime(short.end_time)}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">Length: </span>
                                    <span className="font-mono text-orange-400 font-semibold">
                                      {(() => {
                                        const totalSec = Math.round(short.duration);
                                        const hours = Math.floor(totalSec / 3600);
                                        const minutes = Math.floor((totalSec % 3600) / 60);
                                        const seconds = totalSec % 60;

                                        if (hours > 0) {
                                          return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                                        } else {
                                          return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                        }
                                      })()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Action Buttons */}
                          {editingShortId === short.id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateShortTiming(short.id, short.start_time, short.end_time);
                                }}
                                disabled={updatingShortId === short.id}
                                className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                              >
                                {updatingShortId === short.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                                Save
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingShortId(null);
                                  fetchShorts();
                                }}
                                disabled={updatingShortId === short.id}
                                className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Implement cut functionality
                              }}
                              className="w-full py-1.5 mt-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Scissors className="w-4 h-4" />
                              Cut This Short
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-center">
                    <div className="text-gray-500">
                      <Scissors className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p className="text-base font-medium mb-2">No shorts analyzed yet</p>
                      <p className="text-sm text-gray-600">
                        Click "Generate Shorts" to analyze your video
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : leftPanelView === "captions" ? (
            /* Captions Settings View - EXACT COPY from story editor */
            <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Caption Settings</h2>

              {/* Enable/Disable Captions */}
              <div className="p-4 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white">Enable Captions</h3>
                    <p className="text-xs text-gray-400 mt-1">Show text captions in exported video</p>
                  </div>
                  <button
                    onClick={() => setCaptionsEnabled(!captionsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      captionsEnabled ? "bg-orange-600" : "bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        captionsEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {captionsEnabled && (
                <>
                  {/* Caption Position from Bottom */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Position from Bottom: <span className="text-orange-400 font-bold">{captionPositionFromBottom}%</span>
                    </label>
                    <Slider
                      value={[captionPositionFromBottom]}
                      onValueChange={(value) => setCaptionPositionFromBottom(value[0])}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Font Family */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Family
                    </label>
                    <select
                      value={captionFontFamily}
                      onChange={(e) => setCaptionFontFamily(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-orange-500"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '2.5rem',
                      }}
                    >
                      {Array.from(getFontsByCategory()).map(([category, fonts]) => (
                        <optgroup key={category} label={category} className="bg-gray-900 text-gray-400">
                          {fonts.map(font => (
                            <option key={font.name} value={font.name}>{font.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Size: <span className="text-orange-400 font-bold">{captionFontSize}px</span>
                    </label>
                    <Slider
                      value={[captionFontSize]}
                      onValueChange={(value) => setCaptionFontSize(value[0])}
                      min={16}
                      max={32}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Font Weight */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Weight: <span className="text-orange-400 font-bold">{captionFontWeight}</span>
                    </label>
                    <Slider
                      value={[captionFontWeight]}
                      onValueChange={(value) => setCaptionFontWeight(value[0])}
                      min={100}
                      max={900}
                      step={100}
                      className="w-full"
                    />
                  </div>

                  {/* Active Word Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Active Word Color
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          value={captionActiveColor}
                          onChange={(e) => setCaptionActiveColor(e.target.value)}
                          className="w-12 h-10 rounded border-2 border-gray-700 cursor-pointer bg-transparent"
                          style={{ colorScheme: 'dark' }}
                        />
                      </div>
                      <input
                        type="text"
                        value={captionActiveColor}
                        onChange={(e) => setCaptionActiveColor(e.target.value)}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-300 text-sm focus:outline-none focus:border-orange-500"
                        placeholder="#FFEB3B"
                      />
                    </div>
                  </div>

                  {/* Inactive Word Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Inactive Word Color
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          value={captionInactiveColor}
                          onChange={(e) => setCaptionInactiveColor(e.target.value)}
                          className="w-12 h-10 rounded border-2 border-gray-700 cursor-pointer bg-transparent"
                          style={{ colorScheme: 'dark' }}
                        />
                      </div>
                      <input
                        type="text"
                        value={captionInactiveColor}
                        onChange={(e) => setCaptionInactiveColor(e.target.value)}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-300 text-sm focus:outline-none focus:border-orange-500"
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>

                  {/* Text Transform */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Text Transform
                    </label>
                    <select
                      value={captionTextTransform}
                      onChange={(e) => setCaptionTextTransform(e.target.value as any)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded text-gray-300"
                    >
                      <option value="none">None</option>
                      <option value="uppercase">UPPERCASE</option>
                      <option value="lowercase">lowercase</option>
                      <option value="capitalize">Capitalize Each Word</option>
                    </select>
                  </div>

                  {/* Words Per Batch */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Words Per Batch: <span className="text-orange-400 font-bold">{captionWordsPerBatch} {captionWordsPerBatch === 1 ? 'word' : 'words'}</span>
                    </label>
                    <Slider
                      value={[captionWordsPerBatch]}
                      onValueChange={(value) => setCaptionWordsPerBatch(value[0])}
                      min={1}
                      max={5}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </>
              )}
            </div>
          ) : leftPanelView === "background_music" ? (
            /* Background Music Settings View - EXACT COPY from story editor */
            <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">
              <h2 className="text-xl font-semibold text-white">Background music</h2>

              {/* Volume Control */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Volume</h3>
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-gray-400" />
                  <Slider
                    value={[bgMusicVolume]}
                    onValueChange={(value) => {
                      setBgMusicVolume(value[0]);
                      if (bgMusicAudioRef.current) {
                        bgMusicAudioRef.current.volume = value[0] / 100;
                      }
                    }}
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-semibold text-white w-12 text-right">{bgMusicVolume}%</span>
                </div>
              </div>

              {/* Import/Upload Music Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Add Music</h3>

                <div className="grid grid-cols-3 gap-2">
                  {/* Upload Button */}
                  <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center transition-colors hover:border-gray-600">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        setBgMusicUploading(true);
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
                        formData.append("description", `Uploaded by user on ${new Date().toLocaleDateString()}`);
                        formData.append("category", "other");
                        formData.append("uploaded_by", user?.id || "unknown");

                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          const headers: HeadersInit = {
                            "Authorization": session?.access_token ? `Bearer ${session.access_token}` : "",
                          };

                          const res = await fetch("/api/music/library", {
                            method: "POST",
                            headers,
                            body: formData,
                          });

                          if (!res.ok) throw new Error("Upload failed");

                          const data = await res.json();

                          if (data.music) {
                            setMusicLibrary(prev => [data.music, ...prev]);
                            handleSelectMusicFromLibrary(data.music);
                          }

                          toast({ description: "Music uploaded to your library successfully" });
                        } catch (err) {
                          console.error("Upload error:", err);
                          toast({ description: "Failed to upload music", variant: "destructive" });
                        } finally {
                          setBgMusicUploading(false);
                        }
                      }}
                      disabled={bgMusicUploading}
                      className="hidden"
                      id="music-upload"
                    />
                    <label
                      htmlFor="music-upload"
                      className="cursor-pointer block"
                    >
                      {bgMusicUploading ? (
                        <Loader2 className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
                      ) : (
                        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      )}
                      <p className="text-xs font-medium text-white leading-tight">Upload from Device</p>
                    </label>
                  </div>

                  {/* Import from URL Button - Disabled for now */}
                  <button
                    disabled
                    className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center transition-colors hover:border-gray-600 disabled:opacity-50"
                  >
                    <Download className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-xs font-medium text-white leading-tight">Import from URL</p>
                  </button>

                  {/* Import from YouTube Button - Disabled for now */}
                  <button
                    disabled
                    className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center transition-colors hover:border-gray-600 disabled:opacity-50"
                  >
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <p className="text-xs font-medium text-white leading-tight">Import from YouTube</p>
                  </button>
                </div>
              </div>

              {/* Music Library */}
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {musicLibraryLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : musicLibrary.length === 0 ? (
                  <div className="text-center py-12">
                    <Music className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                    <p className="text-sm text-gray-400">No music tracks available</p>
                    <p className="text-xs text-gray-500 mt-1">Upload your first track to get started</p>
                  </div>
                ) : (
                  musicLibrary.map((music) => (
                    <div
                      key={music.id}
                      onClick={() => music.file_url && handleSelectMusicFromLibrary(music)}
                      className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        bgMusicId === music.id
                          ? "bg-orange-900/30 border border-orange-600/50"
                          : music.file_url
                          ? "hover:bg-gray-800/50 border border-transparent"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          bgMusicId === music.id ? "text-orange-400" : "text-white"
                        }`}>
                          {music.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {music.category && music.category.charAt(0).toUpperCase() + music.category.slice(1)}
                          </span>
                          {!music.is_preset && (
                            <span className="text-xs text-gray-400">• My Music</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Play/Pause Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMusicPreview(music);
                          }}
                          disabled={!music.file_url}
                          className={`w-8 h-8 flex items-center justify-center rounded transition-all ${
                            musicPreviewPlaying === music.id
                              ? "bg-orange-600 hover:bg-orange-700 text-white"
                              : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 opacity-0 group-hover:opacity-100"
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          {musicPreviewPlaying === music.id ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>

                        {/* Delete Button */}
                        {music.uploaded_by === user?.id && !music.is_preset && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMusic(music);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-900/20 text-gray-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                            title="Delete music"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
