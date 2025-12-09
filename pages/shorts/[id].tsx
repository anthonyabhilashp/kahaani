import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Loader2, Scissors, Play, Pause, Volume2, VolumeX, Save, Type, X, Check, Download, ChevronDown, Copy, ExternalLink, Music, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import { Slider } from "@/components/ui/slider";
import { WordByWordCaption, type WordTimestamp } from "../../components/WordByWordCaption";
import { getFontsByCategory } from "@/lib/fonts";

// Declare YouTube IFrame API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

type CutShortVideo = {
  id: string;
  title: string | null;
  video_url: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  transcript: string | null;
  word_timestamps: Array<{ word: string; start: number; end: number }> | null;
};

// Extract YouTube video ID from URL
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

type CaptionSettings = {
  enabled: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  positionFromBottom: number;
  activeColor: string;
  inactiveColor: string;
  wordsPerBatch: number;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
};

const defaultCaptionSettings: CaptionSettings = {
  enabled: false,
  fontFamily: "Montserrat",
  fontSize: 18,
  fontWeight: 600,
  positionFromBottom: 20,
  activeColor: "#02f7f3",
  inactiveColor: "#FFFFFF",
  wordsPerBatch: 3,
  textTransform: "none",
};

type MusicSettings = {
  enabled: boolean;
  music_id: string | null;
  volume: number;
};

type MusicTrack = {
  id: string;
  name: string;
  url: string;
  duration: number;
  is_preset: boolean;
};

const defaultMusicSettings: MusicSettings = {
  enabled: false,
  music_id: null,
  volume: 30,
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
  caption_settings?: CaptionSettings | null;
  word_timestamps?: WordTimestamp[] | null;
  music_settings?: MusicSettings | null;
};

export default function ShortsPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [sourceVideo, setSourceVideo] = useState<CutShortVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingShorts, setAnalyzingShorts] = useState(false);
  const [shortsSuggestions, setShortsSuggestions] = useState<ShortSuggestion[]>([]);
  const [selectedShortId, setSelectedShortId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [editingShortId, setEditingShortId] = useState<string | null>(null);
  const [updatingShortId, setUpdatingShortId] = useState<string | null>(null);
  const [playingPreviews, setPlayingPreviews] = useState<Set<string>>(new Set());
  const [previewVolumes, setPreviewVolumes] = useState<Map<string, number>>(new Map());

  // Caption settings per short - track which short has caption panel open
  const [captionPanelOpenId, setCaptionPanelOpenId] = useState<string | null>(null);
  const [shortCaptionSettings, setShortCaptionSettings] = useState<Map<string, CaptionSettings>>(new Map());
  const [savingCaptionId, setSavingCaptionId] = useState<string | null>(null);
  const [generatingCaptionsId, setGeneratingCaptionsId] = useState<string | null>(null);
  const [cuttingShortId, setCuttingShortId] = useState<string | null>(null);

  // Music settings per short
  const [musicPanelOpenId, setMusicPanelOpenId] = useState<string | null>(null);
  const [shortMusicSettings, setShortMusicSettings] = useState<Map<string, MusicSettings>>(new Map());
  const [savingMusicId, setSavingMusicId] = useState<string | null>(null);
  const [musicLibrary, setMusicLibrary] = useState<MusicTrack[]>([]);
  const [loadingMusicLibrary, setLoadingMusicLibrary] = useState(false);
  const [previewingMusicId, setPreviewingMusicId] = useState<string | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);
  // Background music audio elements for video preview (per short)
  const bgMusicAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  // Store music track URLs by music_id for playback without needing library loaded
  const musicTrackUrlsRef = useRef<Map<string, string>>(new Map());

  // Store initial zoom ranges for each short (fixed when shorts are loaded)
  const initialZoomRangesRef = useRef<Map<string, { rangeStart: number; rangeEnd: number }>>(new Map());
  // Refs to access latest state values in event handlers
  const shortMusicSettingsRef = useRef<Map<string, MusicSettings>>(new Map());
  const musicLibraryRef = useRef<MusicTrack[]>([]);

  // Track current playback time per short for caption sync
  const [shortCurrentTimes, setShortCurrentTimes] = useState<Map<string, number>>(new Map());

  // YouTube IFrame API
  const [ytApiReady, setYtApiReady] = useState(false);
  const [ytPlayersReady, setYtPlayersReady] = useState<Set<string>>(new Set());
  const ytPlayersRef = useRef<Map<string, any>>(new Map());
  const ytTimeUpdateIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Store current short times in ref so player callbacks can access latest values
  const shortTimesRef = useRef<Map<string, { start: number; end: number }>>(new Map());

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      setYtApiReady(true);
      return;
    }

    // Define callback for when API is ready
    window.onYouTubeIframeAPIReady = () => {
      setYtApiReady(true);
    };

    // Load the API script if not already present
    if (!document.getElementById('youtube-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      // Cleanup intervals on unmount
      ytTimeUpdateIntervalsRef.current.forEach(interval => clearInterval(interval));
      ytTimeUpdateIntervalsRef.current.clear();
    };
  }, []);

  // Keep shortTimesRef in sync with shortsSuggestions state
  useEffect(() => {
    shortsSuggestions.forEach(short => {
      shortTimesRef.current.set(short.id, { start: short.start_time, end: short.end_time });
    });
  }, [shortsSuggestions]);

  // Keep music refs in sync with state
  useEffect(() => {
    shortMusicSettingsRef.current = shortMusicSettings;
  }, [shortMusicSettings]);

  useEffect(() => {
    musicLibraryRef.current = musicLibrary;
  }, [musicLibrary]);

  // Fetch source video and shorts
  useEffect(() => {
    if (!id) return;
    fetchSourceVideo();
  }, [id]);

  // Load music library on mount (needed for video preview with music)
  useEffect(() => {
    if (user?.id) {
      fetchMusicLibrary();
    }
  }, [user?.id]);

  const fetchSourceVideo = async () => {
    if (!id) return;
    setLoading(true);

    try {
      // Fetch cut_short_video
      const { data: video, error: videoError } = await supabase
        .from("cut_short_videos")
        .select("*")
        .eq("id", id)
        .single();

      if (videoError || !video) {
        throw new Error("Video not found");
      }

      setSourceVideo(video);

      // Fetch shorts for this video
      const { data: shorts, error: shortsError } = await supabase
        .from("shorts")
        .select("*")
        .eq("parent_video_id", id)
        .order("score", { ascending: false });

      if (shorts && !shortsError) {
        const mappedShorts = shorts.map((s: any) => ({
          id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
          duration: s.end_time - s.start_time,
          title: s.title,
          hook_line: s.hook_line,
          score: s.score,
          reason: s.reason,
          video_url: s.video_url,
          thumbnail_url: s.thumbnail_url,
          caption_settings: s.caption_settings,
          word_timestamps: s.word_timestamps,
          music_settings: s.music_settings || null,
        }));
        setShortsSuggestions(mappedShorts);

        // Initialize caption settings for each short
        const newCaptionSettings = new Map<string, CaptionSettings>();
        mappedShorts.forEach((s: ShortSuggestion) => {
          newCaptionSettings.set(s.id, s.caption_settings || { ...defaultCaptionSettings });
        });
        setShortCaptionSettings(newCaptionSettings);

        // Initialize music settings for each short (if any have music configured)
        const newMusicSettings = new Map<string, MusicSettings>();
        const musicIds = new Set<string>();
        mappedShorts.forEach((s: ShortSuggestion) => {
          if (s.music_settings) {
            newMusicSettings.set(s.id, s.music_settings);
            if (s.music_settings.enabled && s.music_settings.music_id) {
              musicIds.add(s.music_settings.music_id);
            }
          }
        });
        if (newMusicSettings.size > 0) {
          setShortMusicSettings(newMusicSettings);
        }

        // Fetch music track URLs (non-blocking)
        if (musicIds.size > 0) {
          supabase
            .from('background_music_library')
            .select('id, file_url')
            .in('id', Array.from(musicIds))
            .then(({ data: musicTracks }) => {
              if (musicTracks) {
                musicTracks.forEach((track: { id: string; file_url: string }) => {
                  musicTrackUrlsRef.current.set(track.id, track.file_url);
                });
              }
            });
        }
      }
    } catch (err: any) {
      console.error("Error fetching video:", err);
      toast({
        title: "Error",
        description: "Failed to load video details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchShorts = async () => {
    if (!id) return;

    try {
      const { data: shorts, error } = await supabase
        .from("shorts")
        .select("*")
        .eq("parent_video_id", id)
        .order("score", { ascending: false });

      if (shorts && !error) {
        const mappedShorts = shorts.map((s: any) => ({
          id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
          duration: s.end_time - s.start_time,
          title: s.title,
          hook_line: s.hook_line,
          score: s.score,
          reason: s.reason,
          video_url: s.video_url,
          thumbnail_url: s.thumbnail_url,
          caption_settings: s.caption_settings,
          word_timestamps: s.word_timestamps,
          music_settings: s.music_settings || null,
        }));
        setShortsSuggestions(mappedShorts);

        // Initialize caption settings for each short
        const newCaptionSettings = new Map<string, CaptionSettings>();
        mappedShorts.forEach((s: ShortSuggestion) => {
          newCaptionSettings.set(s.id, s.caption_settings || { ...defaultCaptionSettings });
        });
        setShortCaptionSettings(newCaptionSettings);

        // Initialize music settings for each short (if any have music configured)
        const newMusicSettings = new Map<string, MusicSettings>();
        const musicIds = new Set<string>();
        mappedShorts.forEach((s: ShortSuggestion) => {
          if (s.music_settings) {
            newMusicSettings.set(s.id, s.music_settings);
            if (s.music_settings.enabled && s.music_settings.music_id) {
              musicIds.add(s.music_settings.music_id);
            }
          }
        });
        if (newMusicSettings.size > 0) {
          setShortMusicSettings(newMusicSettings);
        }

        // Fetch music track URLs (non-blocking)
        if (musicIds.size > 0) {
          supabase
            .from('background_music_library')
            .select('id, file_url')
            .in('id', Array.from(musicIds))
            .then(({ data: musicTracks }) => {
              if (musicTracks) {
                musicTracks.forEach((track: { id: string; file_url: string }) => {
                  musicTrackUrlsRef.current.set(track.id, track.file_url);
                });
              }
            });
        }
      }
    } catch (err: any) {
      console.error("Error fetching shorts:", err);
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

      // Update local state - keep word_timestamps (they're stored as absolute times)
      // The getShortWordTimestamps function will filter based on new timing
      const shortData = shortsSuggestions.find(s => s.id === shortId);
      setShortsSuggestions(prev =>
        prev.map(s => s.id === shortId ? {
          ...data.short,
          word_timestamps: shortData?.word_timestamps // Keep existing timestamps
        } : s)
      );

      setEditingShortId(null);

      toast({
        title: "Updated!",
        description: "Short timing updated successfully"
      });

      // Destroy and recreate YouTube player with new timing
      const existingPlayer = ytPlayersRef.current.get(shortId);
      if (existingPlayer?.destroy) {
        existingPlayer.destroy();
        ytPlayersRef.current.delete(shortId);
        setYtPlayersReady(prev => {
          const newSet = new Set(prev);
          newSet.delete(shortId);
          return newSet;
        });

        // Recreate after a short delay
        if (sourceVideo?.youtube_url) {
          const ytVideoId = extractYouTubeVideoId(sourceVideo.youtube_url);
          if (ytVideoId) {
            setTimeout(() => {
              initYouTubePlayer(shortId, ytVideoId, start_time, end_time);
            }, 300);
          }
        }
      }
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
        const maxTime = sourceVideo?.duration || 0;

        // Validate bounds
        if (field === 'start_time' && (newValue < 0 || newValue >= s.end_time)) return s;
        if (field === 'end_time' && (newValue <= s.start_time || newValue > maxTime)) return s;

        const updated = { ...s, [field]: newValue };
        updated.duration = updated.end_time - updated.start_time;
        return updated;
      })
    );
  };

  // Get caption settings for a specific short
  const getCaptionSettings = (shortId: string): CaptionSettings => {
    return shortCaptionSettings.get(shortId) || { ...defaultCaptionSettings };
  };

  // Update caption settings for a specific short (local state only)
  const updateCaptionSetting = (shortId: string, key: keyof CaptionSettings, value: any) => {
    setShortCaptionSettings(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(shortId) || { ...defaultCaptionSettings };
      newMap.set(shortId, { ...current, [key]: value });
      return newMap;
    });
  };

  // Save caption settings to database
  const saveCaptionSettings = async (shortId: string) => {
    setSavingCaptionId(shortId);
    const settings = getCaptionSettings(shortId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch("/api/save_caption_settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          short_id: shortId,
          caption_settings: settings,
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save caption settings");
      }

      // Update shortsSuggestions state so settings persist after refresh
      setShortsSuggestions(prev =>
        prev.map(s => s.id === shortId ? { ...s, caption_settings: settings } : s)
      );

      toast({
        title: "Saved!",
        description: "Caption settings saved successfully"
      });
    } catch (err: any) {
      console.error("Error saving caption settings:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save caption settings",
        variant: "destructive"
      });
    } finally {
      setSavingCaptionId(null);
    }
  };

  // Generate captions for a specific short
  const generateCaptions = async (shortId: string, force: boolean = false) => {
    setGeneratingCaptionsId(shortId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch("/api/shorts/generate-captions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ short_id: shortId, force })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate captions");
      }

      const data = await response.json();

      // Update local state with new word_timestamps
      setShortsSuggestions(prev =>
        prev.map(s => s.id === shortId ? { ...s, word_timestamps: data.word_timestamps } : s)
      );

      toast({
        title: "Captions Generated!",
        description: `Generated ${data.word_timestamps?.length || 0} word timestamps`
      });
    } catch (err: any) {
      console.error("Error generating captions:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to generate captions",
        variant: "destructive"
      });
    } finally {
      setGeneratingCaptionsId(null);
    }
  };

  // Cut short - download segment and save to storage
  const cutShort = async (shortId: string) => {
    setCuttingShortId(shortId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch("/api/shorts/cut", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ short_id: shortId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cut short");
      }

      const data = await response.json();

      // Update local state with new video_url
      setShortsSuggestions(prev =>
        prev.map(s => s.id === shortId ? { ...s, video_url: data.video_url } : s)
      );

      toast({
        title: "Short Cut!",
        description: "Video saved successfully"
      });
    } catch (err: any) {
      console.error("Error cutting short:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to cut short",
        variant: "destructive"
      });
    } finally {
      setCuttingShortId(null);
    }
  };

  // Fetch music library
  const fetchMusicLibrary = async () => {
    setLoadingMusicLibrary(true);
    try {
      const params = new URLSearchParams();
      if (user?.id) params.append("user_id", user.id);

      const res = await fetch(`/api/music/library?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        // Map database columns to MusicTrack type (file_url -> url)
        const tracks: MusicTrack[] = (data.music || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          url: m.file_url || m.url, // database uses file_url
          duration: m.duration || 0,
          is_preset: m.is_preset || false,
        }));
        setMusicLibrary(tracks);
      } else {
        console.error("Failed to fetch music library");
      }
    } catch (err) {
      console.error("Error fetching music library:", err);
    } finally {
      setLoadingMusicLibrary(false);
    }
  };

  // Get music settings for a specific short
  const getMusicSettings = (shortId: string): MusicSettings => {
    return shortMusicSettings.get(shortId) || { ...defaultMusicSettings };
  };

  // Update a music setting for a specific short
  const updateMusicSetting = <K extends keyof MusicSettings>(
    shortId: string,
    key: K,
    value: MusicSettings[K]
  ) => {
    setShortMusicSettings(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(shortId) || { ...defaultMusicSettings };
      newMap.set(shortId, { ...current, [key]: value });
      return newMap;
    });
  };

  // Fetch music settings for a short from API
  const fetchMusicSettings = async (shortId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/shorts/${shortId}/music`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setShortMusicSettings(prev => {
          const newMap = new Map(prev);
          newMap.set(shortId, {
            enabled: data.enabled || false,
            music_id: data.music_id || null,
            volume: data.volume ?? 30,
          });
          return newMap;
        });
      }
    } catch (err) {
      console.error("Error fetching music settings:", err);
    }
  };

  // Save music settings to database
  const saveMusicSettings = async (shortId: string) => {
    setSavingMusicId(shortId);
    const settings = getMusicSettings(shortId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(`/api/shorts/${shortId}/music`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save music settings");
      }

      toast({
        title: "Saved!",
        description: "Music settings saved successfully"
      });
    } catch (err: any) {
      console.error("Error saving music settings:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save music settings",
        variant: "destructive"
      });
    } finally {
      setSavingMusicId(null);
    }
  };

  // Toggle music preview playback
  const toggleMusicPreview = (track: MusicTrack) => {
    if (previewingMusicId === track.id) {
      // Stop playing
      if (musicPreviewRef.current) {
        musicPreviewRef.current.pause();
        musicPreviewRef.current.currentTime = 0;
      }
      setPreviewingMusicId(null);
    } else {
      // Start playing
      if (musicPreviewRef.current) {
        musicPreviewRef.current.pause();
      }
      const audio = new Audio(track.url);
      audio.volume = 0.5;
      audio.onended = () => setPreviewingMusicId(null);
      audio.play();
      musicPreviewRef.current = audio;
      setPreviewingMusicId(track.id);
    }
  };

  // Stop music preview on panel close
  const stopMusicPreview = () => {
    if (musicPreviewRef.current) {
      musicPreviewRef.current.pause();
      musicPreviewRef.current.currentTime = 0;
    }
    setPreviewingMusicId(null);
  };

  // Start background music for video preview
  const startBgMusicForPreview = (shortId: string) => {
    // Use refs to get latest state values
    const settings = shortMusicSettingsRef.current.get(shortId);
    if (!settings?.enabled || !settings?.music_id) {
      console.log('Music not enabled or no music_id for short', shortId);
      return;
    }

    // Get music URL from ref (preloaded) or from library ref
    let musicUrl = musicTrackUrlsRef.current.get(settings.music_id);
    if (!musicUrl) {
      // Try to find in library as fallback
      const track = musicLibraryRef.current.find(t => t.id === settings.music_id);
      if (track) {
        musicUrl = track.url;
        musicTrackUrlsRef.current.set(settings.music_id, track.url);
      }
    }

    if (!musicUrl) {
      console.log('Music URL not found for', settings.music_id);
      return;
    }

    console.log('Starting bg music for short', shortId, 'url:', musicUrl);

    // Stop any existing audio for this short
    const existingAudio = bgMusicAudioRef.current.get(shortId);
    if (existingAudio) {
      existingAudio.pause();
    }

    // Create new audio element
    const audio = new Audio(musicUrl);
    audio.loop = true;
    audio.volume = (settings.volume ?? 30) / 100;
    audio.play().catch(err => console.error('Failed to play bg music:', err));
    bgMusicAudioRef.current.set(shortId, audio);
  };

  // Stop background music for video preview
  const stopBgMusicForPreview = (shortId: string) => {
    const audio = bgMusicAudioRef.current.get(shortId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      bgMusicAudioRef.current.delete(shortId);
    }
  };

  // Update background music volume in real-time
  const updateBgMusicVolume = (shortId: string, volume: number) => {
    const audio = bgMusicAudioRef.current.get(shortId);
    if (audio) {
      audio.volume = volume / 100;
    }
  };

  // Get word timestamps for a specific short - filters and adjusts based on current timing
  const getShortWordTimestamps = useCallback((short: ShortSuggestion): WordTimestamp[] => {
    if (!short.word_timestamps || short.word_timestamps.length === 0) return [];

    // word_timestamps are stored with ABSOLUTE times (relative to original video)
    // Filter to current short's range and make relative to short start
    return short.word_timestamps
      .filter(w => w.start >= short.start_time && w.start < short.end_time)
      .map(w => ({
        word: w.word,
        start: w.start - short.start_time,
        end: w.end - short.start_time,
      }));
  }, []);

  // Initialize YouTube player for a short
  const initYouTubePlayer = useCallback((shortId: string, videoId: string, startTime: number, endTime: number) => {
    if (!ytApiReady || !window.YT) return;

    const containerId = `yt-player-${shortId}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Don't recreate if already exists
    if (ytPlayersRef.current.has(shortId)) return;

    const player = new window.YT.Player(containerId, {
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        start: Math.floor(startTime),
        enablejsapi: 1,
        origin: window.location.origin,
        disablekb: 1,
      },
      events: {
        onReady: (event: any) => {
          console.log(`YouTube player ready for short ${shortId}`);
          // Mark player as ready immediately
          setYtPlayersReady(prev => new Set(prev).add(shortId));
        },
        onStateChange: (event: any) => {
          const playerState = event.data;

          // YT.PlayerState.PLAYING = 1
          if (playerState === 1) {
            // Get CURRENT times from ref (not closure values)
            const times = shortTimesRef.current.get(shortId) || { start: startTime, end: endTime };

            // Check if we need to seek to start position
            const currentTime = event.target.getCurrentTime();
            if (currentTime < times.start || currentTime >= times.end) {
              event.target.seekTo(times.start, true);
            }

            // Start background music if enabled
            // Dispatch custom event to trigger music start (avoids closure issues)
            window.dispatchEvent(new CustomEvent('short-play', { detail: { shortId } }));

            // Start tracking time
            const interval = setInterval(() => {
              try {
                // Get CURRENT times from ref each tick
                const currentTimes = shortTimesRef.current.get(shortId) || { start: startTime, end: endTime };
                const currentTime = event.target.getCurrentTime();
                const relativeTime = currentTime - currentTimes.start;
                setShortCurrentTimes(prev => new Map(prev.set(shortId, relativeTime)));

                // Loop back if past end time
                if (currentTime >= currentTimes.end) {
                  event.target.seekTo(currentTimes.start, true);
                  // Restart background music from beginning on loop
                  const bgAudio = bgMusicAudioRef.current.get(shortId);
                  if (bgAudio) {
                    bgAudio.currentTime = 0;
                  }
                }
              } catch (e) {
                // Player might be destroyed
              }
            }, 50); // Update every 50ms for smoother captions

            ytTimeUpdateIntervalsRef.current.set(shortId, interval);
            setPlayingPreviews(new Set([shortId]));
          } else {
            // Stop tracking when paused/ended
            const interval = ytTimeUpdateIntervalsRef.current.get(shortId);
            if (interval) {
              clearInterval(interval);
              ytTimeUpdateIntervalsRef.current.delete(shortId);
            }
            if (playerState !== 1) {
              setPlayingPreviews(prev => {
                const newSet = new Set(prev);
                newSet.delete(shortId);
                return newSet;
              });
              // Stop background music
              window.dispatchEvent(new CustomEvent('short-pause', { detail: { shortId } }));
            }
          }
        },
      },
    });

    ytPlayersRef.current.set(shortId, player);
  }, [ytApiReady]);

  // Effect to initialize YouTube players when API is ready and shorts are loaded
  useEffect(() => {
    if (!ytApiReady || !sourceVideo?.youtube_url || shortsSuggestions.length === 0) return;

    const ytVideoId = extractYouTubeVideoId(sourceVideo.youtube_url);
    if (!ytVideoId) return;

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      shortsSuggestions.forEach(short => {
        initYouTubePlayer(short.id, ytVideoId, short.start_time, short.end_time);
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [ytApiReady, sourceVideo?.youtube_url, shortsSuggestions, initYouTubePlayer]);

  // Listen for custom events to start/stop background music (avoids closure issues in YT player callbacks)
  useEffect(() => {
    const handlePlay = (e: CustomEvent<{ shortId: string }>) => {
      startBgMusicForPreview(e.detail.shortId);
    };
    const handlePause = (e: CustomEvent<{ shortId: string }>) => {
      stopBgMusicForPreview(e.detail.shortId);
    };

    window.addEventListener('short-play', handlePlay as EventListener);
    window.addEventListener('short-pause', handlePause as EventListener);

    return () => {
      window.removeEventListener('short-play', handlePlay as EventListener);
      window.removeEventListener('short-pause', handlePause as EventListener);
      // Cleanup all background music on unmount
      bgMusicAudioRef.current.forEach(audio => {
        audio.pause();
      });
      bgMusicAudioRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - we use refs to access latest state

  const analyzeShorts = async () => {
    if (!id || typeof id !== 'string') return;
    if (!sourceVideo) {
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

      const response = await fetch("/api/shorts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          parent_video_id: id,
          force_retranscribe: true // Always use Whisper for accurate word-level timestamps
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to analyze video");
      }

      const data = await response.json();

      // Refresh shorts from database
      await fetchShorts();

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
            onClick={() => router.push('/?category=cut-shorts')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Cut Shorts</span>
          </button>
          <div className="h-6 w-px bg-gray-700"></div>
          <h1 className="text-xl font-semibold">{sourceVideo?.title || 'Untitled'}</h1>
        </div>

        {/* Video Stats & Controls */}
        <div className="flex items-center gap-6">
          {/* Video Duration */}
          <div className="text-sm text-gray-400">
            Duration: <span className="text-white font-medium">{sourceVideo?.duration ? formatTime(sourceVideo.duration) : 'Unknown'}</span>
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
            className="flex flex-col items-center gap-1 p-2 transition-colors text-orange-400"
          >
            <Scissors className="w-5 h-5" />
            <span className="text-[10px]">Shorts</span>
          </button>
        </aside>

        {/* Main Content Panel */}
        <div className="flex-1 bg-black flex flex-col overflow-hidden">
          <>
              {/* Generate Shorts Button - Only show when no shorts exist */}
              {shortsSuggestions.length === 0 && (
                <div className="p-6 border-b border-gray-800">
                  <button
                    onClick={analyzeShorts}
                    disabled={analyzingShorts || (!sourceVideo?.video_url && !sourceVideo?.youtube_url)}
                    title={
                      (!sourceVideo?.video_url && !sourceVideo?.youtube_url)
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
                        className={`relative w-full bg-gray-900 rounded-lg border transition-all hover:shadow-xl overflow-hidden ${
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
                            height: typeof window !== 'undefined' && window.innerWidth < 768 ? '600px' : '400px',
                          }}
                        >
                          {/* YouTube embed via IFrame API for caption sync */}
                          {!sourceVideo?.video_url && sourceVideo?.youtube_url ? (
                            <>
                              <div
                                id={`yt-player-${short.id}`}
                                className="absolute inset-0 w-full h-full"
                              />
                              {/* Controls overlay for YouTube - show on hover */}
                              <div className="absolute inset-0 flex items-center justify-center z-10 opacity-0 hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-3">
                                  {/* Rewind 5s */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const ytPlayer = ytPlayersRef.current.get(short.id);
                                      if (!ytPlayer || !ytPlayersReady.has(short.id)) return;
                                      const currentTime = ytPlayer.getCurrentTime?.() || short.start_time;
                                      const newTime = Math.max(short.start_time, currentTime - 5);
                                      ytPlayer.seekTo(newTime, true);
                                    }}
                                    className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                                  >
                                    <span className="text-white text-xs font-bold">-5</span>
                                  </button>

                                  {/* Play/Pause */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const ytPlayer = ytPlayersRef.current.get(short.id);
                                      if (!ytPlayer || !ytPlayer.playVideo || !ytPlayersReady.has(short.id)) {
                                        console.log('YouTube player not ready yet');
                                        return;
                                      }

                                      if (playingPreviews.has(short.id)) {
                                        // Pause
                                        ytPlayer.pauseVideo();
                                      } else {
                                        // Stop all other players
                                        playingPreviews.forEach(id => {
                                          const otherPlayer = ytPlayersRef.current.get(id);
                                          if (otherPlayer?.pauseVideo) otherPlayer.pauseVideo();
                                        });

                                        // Play from current position (or start if not playing)
                                        const currentTime = ytPlayer.getCurrentTime?.() || 0;
                                        if (currentTime < short.start_time || currentTime > short.end_time) {
                                          ytPlayer.seekTo(short.start_time, true);
                                        }
                                        ytPlayer.playVideo();
                                      }
                                    }}
                                    className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                                  >
                                    {!ytPlayersReady.has(short.id) ? (
                                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                                    ) : playingPreviews.has(short.id) ? (
                                      <Pause className="w-8 h-8 text-white" />
                                    ) : (
                                      <Play className="w-8 h-8 text-white ml-1" />
                                    )}
                                  </button>

                                  {/* Forward 5s */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const ytPlayer = ytPlayersRef.current.get(short.id);
                                      if (!ytPlayer || !ytPlayersReady.has(short.id)) return;
                                      const currentTime = ytPlayer.getCurrentTime?.() || short.start_time;
                                      const newTime = Math.min(short.end_time, currentTime + 5);
                                      ytPlayer.seekTo(newTime, true);
                                    }}
                                    className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                                  >
                                    <span className="text-white text-xs font-bold">+5</span>
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : sourceVideo?.video_url ? (
                            <video
                              src={sourceVideo.video_url}
                              data-short-id={short.id}
                              style={{
                                ...(typeof window !== 'undefined' && window.innerWidth >= 768 && {
                                  aspectRatio: aspectRatio === '1:1' ? '1/1' : aspectRatio === '9:16' ? '9/16' : '16/9',
                                }),
                                maxWidth: '100%',
                                maxHeight: '100%',
                              }}
                              className="object-cover"
                              muted={(previewVolumes.get(short.id) ?? 0) === 0}
                              loop
                              playsInline
                              preload="metadata"
                              onTimeUpdate={(e) => {
                                const video = e.currentTarget;
                                if (video.currentTime >= short.end_time) {
                                  video.currentTime = short.start_time;
                                }
                                // Track current time for caption sync (relative to short start)
                                const relativeTime = video.currentTime - short.start_time;
                                setShortCurrentTimes(prev => new Map(prev.set(short.id, relativeTime)));
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                              No video available
                            </div>
                          )}

                          {/* Video Controls Overlay - Only for uploaded videos, not YouTube embeds */}
                          {sourceVideo?.video_url && (
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 transition-opacity duration-200 flex flex-col justify-end p-4">
                              {/* Controls at bottom */}
                              <div className="flex items-center justify-center gap-4">
                                {/* Play/Pause */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const video = document.querySelector(`video[data-short-id="${short.id}"]`) as HTMLVideoElement;
                                    if (!video) return;

                                    if (playingPreviews.has(short.id)) {
                                      video.pause();
                                      setPlayingPreviews(new Set());
                                    } else {
                                      // Stop all other videos first
                                      playingPreviews.forEach(id => {
                                        const otherVideo = document.querySelector(`video[data-short-id="${id}"]`) as HTMLVideoElement;
                                        if (otherVideo) otherVideo.pause();
                                      });

                                      // Always start from short's start_time
                                      video.currentTime = short.start_time;
                                      video.play();
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
                                    const video = document.querySelector(`video[data-short-id="${short.id}"]`) as HTMLVideoElement;
                                    if (video) {
                                      video.volume = newVol;
                                      video.muted = newVol === 0;
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
                          )}
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

                          {/* Caption Preview Overlay */}
                          {(() => {
                            const captionSettings = getCaptionSettings(short.id);
                            if (!captionSettings.enabled) return null;

                            const wordTimestamps = getShortWordTimestamps(short);
                            if (wordTimestamps.length === 0) return null;

                            const currentTime = shortCurrentTimes.get(short.id) || 0;

                            return (
                              <div
                                className="absolute left-0 right-0 flex justify-center pointer-events-none"
                                style={{
                                  bottom: `${captionSettings.positionFromBottom}%`,
                                }}
                              >
                                <WordByWordCaption
                                  wordTimestamps={wordTimestamps}
                                  currentTime={currentTime}
                                  style={{
                                    fontFamily: captionSettings.fontFamily,
                                    fontSize: `${captionSettings.fontSize}px`,
                                    fontWeight: captionSettings.fontWeight,
                                    color: captionSettings.inactiveColor,
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                                  }}
                                  highlightColor={captionSettings.activeColor}
                                  inactiveColor={captionSettings.inactiveColor}
                                  wordsPerBatch={captionSettings.wordsPerBatch}
                                  textTransform={captionSettings.textTransform}
                                />
                              </div>
                            );
                          })()}
                        </div>

                        {/* Short Info */}
                        <div className="p-2">
                          {/* Title */}
                          <h4 className="font-semibold text-white text-xs mb-2 line-clamp-2 leading-snug">
                            {short.title}
                          </h4>
                          {/* Custom YouTube-style Seek Bar with ±60s zoom */}
                          {(() => {
                            const videoDuration = sourceVideo?.duration || 1;

                            // Get or initialize fixed zoom range (only set once per short)
                            if (!initialZoomRangesRef.current.has(short.id)) {
                              initialZoomRangesRef.current.set(short.id, {
                                rangeStart: Math.max(0, short.start_time - 60),
                                rangeEnd: Math.min(videoDuration, short.end_time + 60),
                              });
                            }
                            const zoomRange = initialZoomRangesRef.current.get(short.id)!;
                            const rangeStart = zoomRange.rangeStart;
                            const rangeEnd = zoomRange.rangeEnd;
                            const rangeWidth = rangeEnd - rangeStart;

                            // Calculate percentages within the fixed zoom range
                            const startPercent = ((short.start_time - rangeStart) / rangeWidth) * 100;
                            const endPercent = ((short.end_time - rangeStart) / rangeWidth) * 100;

                            const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickX = e.clientX - rect.left;
                              const percent = clickX / rect.width;
                              const seekTime = rangeStart + (percent * rangeWidth);

                              // Seek the player
                              const ytPlayer = ytPlayersRef.current.get(short.id);
                              if (ytPlayer?.seekTo) ytPlayer.seekTo(seekTime, true);
                              const videoEl = document.querySelector(`video[data-short-id="${short.id}"]`) as HTMLVideoElement;
                              if (videoEl) videoEl.currentTime = seekTime;
                            };

                            const handleDrag = (type: 'start' | 'end') => (e: React.MouseEvent<HTMLDivElement>) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const seekBar = e.currentTarget.parentElement;
                              if (!seekBar) return;

                              // Store current values at drag start
                              let currentStart = short.start_time;
                              let currentEnd = short.end_time;

                              const onMouseMove = (moveEvent: MouseEvent) => {
                                const rect = seekBar.getBoundingClientRect();
                                const clickX = Math.max(0, Math.min(moveEvent.clientX - rect.left, rect.width));
                                const percent = clickX / rect.width;
                                const newTime = Math.round((rangeStart + percent * rangeWidth) * 2) / 2; // Snap to 0.5s

                                if (type === 'start' && newTime < currentEnd - 1 && newTime >= 0) {
                                  setShortsSuggestions(prev => prev.map(s => {
                                    if (s.id !== short.id) return s;
                                    currentStart = newTime;
                                    return { ...s, start_time: newTime, duration: currentEnd - newTime };
                                  }));
                                  setEditingShortId(short.id);
                                  const ytPlayer = ytPlayersRef.current.get(short.id);
                                  if (ytPlayer?.seekTo) ytPlayer.seekTo(newTime, true);
                                } else if (type === 'end' && newTime > currentStart + 1 && newTime <= videoDuration) {
                                  setShortsSuggestions(prev => prev.map(s => {
                                    if (s.id !== short.id) return s;
                                    currentEnd = newTime;
                                    return { ...s, end_time: newTime, duration: newTime - currentStart };
                                  }));
                                  setEditingShortId(short.id);
                                  const ytPlayer = ytPlayersRef.current.get(short.id);
                                  if (ytPlayer?.seekTo) ytPlayer.seekTo(newTime, true);
                                }
                              };

                              const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                              };

                              document.addEventListener('mousemove', onMouseMove);
                              document.addEventListener('mouseup', onMouseUp);
                            };

                            // Calculate current playback position
                            const relativeTime = shortCurrentTimes.get(short.id) || 0;
                            const absoluteTime = short.start_time + relativeTime;
                            const progressPercent = ((absoluteTime - rangeStart) / rangeWidth) * 100;
                            const isPlaying = playingPreviews.has(short.id);

                            return (
                              <div className="px-1 pt-6 pb-2">
                                {/* Seek Bar Container */}
                                <div
                                  className="relative h-1 bg-gray-600 rounded-full cursor-pointer group"
                                  onClick={handleSeekBarClick}
                                >
                                  {/* Selected Range (dimmed) */}
                                  <div
                                    className="absolute h-full bg-orange-500/40 rounded-full"
                                    style={{
                                      left: `${startPercent}%`,
                                      width: `${endPercent - startPercent}%`,
                                    }}
                                  />

                                  {/* Progress (bright) - from start to current position */}
                                  {progressPercent >= startPercent && progressPercent <= endPercent && (
                                    <div
                                      className="absolute h-full bg-orange-500 rounded-full"
                                      style={{
                                        left: `${startPercent}%`,
                                        width: `${progressPercent - startPercent}%`,
                                      }}
                                    />
                                  )}

                                  {/* Start Handle */}
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                                    style={{ left: `${startPercent}%` }}
                                    onMouseDown={handleDrag('start')}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Time Label Above */}
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
                                      {formatTime(short.start_time)}
                                    </div>
                                    {/* Handle */}
                                    <div className="w-3 h-3 bg-orange-500 border-2 border-white rounded-full shadow-md hover:scale-125 transition-transform -ml-1.5" />
                                  </div>

                                  {/* End Handle */}
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                                    style={{ left: `${endPercent}%` }}
                                    onMouseDown={handleDrag('end')}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Time Label Above */}
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
                                      {formatTime(short.end_time)}
                                    </div>
                                    {/* Handle */}
                                    <div className="w-3 h-3 bg-orange-500 border-2 border-white rounded-full shadow-md hover:scale-125 transition-transform -ml-1.5" />
                                  </div>
                                </div>

                                {/* Range indicator & Duration below */}
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400">
                                      {formatTime(short.duration)} clip
                                    </span>
                                    <span className="text-[9px] text-gray-500">
                                      (viewing {formatTime(rangeStart)} - {formatTime(rangeEnd)})
                                    </span>
                                  </div>
                                  {editingShortId === short.id && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingShortId(null);
                                          fetchShorts();
                                        }}
                                        disabled={updatingShortId === short.id}
                                        className="px-2 py-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateShortTiming(short.id, short.start_time, short.end_time);
                                        }}
                                        disabled={updatingShortId === short.id}
                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-[10px] font-medium rounded transition-colors flex items-center gap-1"
                                      >
                                        {updatingShortId === short.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Save className="w-3 h-3" />
                                        )}
                                        Save
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Action Buttons Row - Captions & Music on left, Cut & Download on right */}
                          <div className="mt-2 flex items-center justify-between">
                            {/* Left side - Captions & Music */}
                            <div className="flex items-center gap-2">
                              {/* Caption Settings Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCaptionPanelOpenId(captionPanelOpenId === short.id ? null : short.id);
                                  if (musicPanelOpenId === short.id) {
                                    setMusicPanelOpenId(null);
                                    stopMusicPreview();
                                  }
                                }}
                                disabled={generatingCaptionsId === short.id}
                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                                  short.word_timestamps && short.word_timestamps.length > 0
                                    ? 'bg-green-800 hover:bg-green-700 text-white'
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                                }`}
                              >
                                {generatingCaptionsId === short.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Captions...</span>
                                  </>
                                ) : short.word_timestamps && short.word_timestamps.length > 0 ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Captions</span>
                                  </>
                                ) : (
                                  <>
                                    <Type className="w-3 h-3" />
                                    <span>Captions</span>
                                  </>
                                )}
                              </button>

                              {/* Music Settings Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const isOpening = musicPanelOpenId !== short.id;
                                  setMusicPanelOpenId(isOpening ? short.id : null);
                                  if (captionPanelOpenId === short.id) {
                                    setCaptionPanelOpenId(null);
                                  }
                                  if (isOpening) {
                                    fetchMusicLibrary();
                                    fetchMusicSettings(short.id);
                                  } else {
                                    stopMusicPreview();
                                  }
                                }}
                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                                  getMusicSettings(short.id).enabled
                                    ? 'bg-green-800 hover:bg-green-700 text-white'
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                                }`}
                              >
                                {getMusicSettings(short.id).enabled ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Music</span>
                                  </>
                                ) : (
                                  <>
                                    <Music className="w-3 h-3" />
                                    <span>Music</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Right side - Cut Short & Download */}
                            <div className="flex items-center gap-2">
                              {/* Cut Short Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cutShort(short.id);
                                }}
                                disabled={cuttingShortId === short.id}
                                className="px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 bg-orange-600 hover:bg-orange-700 text-white"
                              >
                                {cuttingShortId === short.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Cutting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Scissors className="w-3 h-3" />
                                    <span>Cut Short</span>
                                  </>
                                )}
                              </button>

                              {/* Download Button with Dropdown - Only show when video exists */}
                              {short.video_url && (
                                <div className="flex items-stretch">
                                  <a
                                    href={short.video_url}
                                    download={`${short.title || 'short'}.mp4`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-3 py-1.5 text-xs rounded-l transition-colors flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download</span>
                                  </a>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        onClick={(e) => e.stopPropagation()}
                                        className="px-2 text-xs rounded-r transition-colors bg-orange-600 hover:bg-orange-700 text-white border-l border-orange-700 flex items-center"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(short.video_url!);
                                          toast({
                                            title: "Copied!",
                                            description: "Video URL copied to clipboard",
                                          });
                                        }}
                                        className="text-white hover:bg-gray-800 cursor-pointer"
                                      >
                                        <Copy className="w-3 h-3 mr-2" />
                                        Copy URL
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(short.video_url!, '_blank');
                                        }}
                                        className="text-white hover:bg-gray-800 cursor-pointer"
                                      >
                                        <ExternalLink className="w-3 h-3 mr-2" />
                                        Open in New Tab
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Caption Settings Drawer - Slides from left */}
                          <div
                            className={`absolute top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-700 shadow-2xl z-20 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
                              captionPanelOpenId === short.id ? 'translate-x-0' : '-translate-x-full'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Drawer Header */}
                            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Type className="w-4 h-4 text-orange-500" />
                                <span className="text-sm font-semibold text-white">Captions</span>
                              </div>
                              <button
                                onClick={() => setCaptionPanelOpenId(null)}
                                className="p-1 hover:bg-gray-700 rounded transition-colors"
                              >
                                <X className="w-4 h-4 text-gray-400" />
                              </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="p-3 space-y-4">
                              {/* Enable/Disable */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-300">Enable Captions</span>
                                <button
                                  onClick={() => {
                                    const currentEnabled = getCaptionSettings(short.id).enabled;
                                    const newEnabled = !currentEnabled;
                                    updateCaptionSetting(short.id, 'enabled', newEnabled);

                                    // If enabling captions and no word_timestamps exist, generate them
                                    if (newEnabled && (!short.word_timestamps || short.word_timestamps.length === 0)) {
                                      generateCaptions(short.id);
                                    }
                                  }}
                                  disabled={generatingCaptionsId === short.id}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                    getCaptionSettings(short.id).enabled ? 'bg-orange-600' : 'bg-gray-600'
                                  } ${generatingCaptionsId === short.id ? 'opacity-50' : ''}`}
                                >
                                  <span
                                    className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                                    style={{ transform: getCaptionSettings(short.id).enabled ? 'translateX(18px)' : 'translateX(2px)' }}
                                  />
                                </button>
                              </div>

                              {/* Generating captions indicator */}
                              {generatingCaptionsId === short.id && (
                                <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 p-2 rounded">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Generating captions...
                                </div>
                              )}

                              {getCaptionSettings(short.id).enabled && (
                                <>
                                  {/* Font Family */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">Font</label>
                                    <select
                                      value={getCaptionSettings(short.id).fontFamily}
                                      onChange={(e) => updateCaptionSetting(short.id, 'fontFamily', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white"
                                    >
                                      {Array.from(getFontsByCategory()).map(([category, fonts]) => (
                                        <optgroup key={category} label={category}>
                                          {fonts.map(font => (
                                            <option key={font.name} value={font.name}>{font.name}</option>
                                          ))}
                                        </optgroup>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Font Size */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">
                                      Size: <span className="text-orange-400">{getCaptionSettings(short.id).fontSize}px</span>
                                    </label>
                                    <Slider
                                      value={[getCaptionSettings(short.id).fontSize]}
                                      onValueChange={(value) => updateCaptionSetting(short.id, 'fontSize', value[0])}
                                      min={12}
                                      max={32}
                                      step={1}
                                      className="w-full"
                                    />
                                  </div>

                                  {/* Position */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">
                                      Position: <span className="text-orange-400">{getCaptionSettings(short.id).positionFromBottom}%</span>
                                    </label>
                                    <Slider
                                      value={[getCaptionSettings(short.id).positionFromBottom]}
                                      onValueChange={(value) => updateCaptionSetting(short.id, 'positionFromBottom', value[0])}
                                      min={5}
                                      max={50}
                                      step={1}
                                      className="w-full"
                                    />
                                  </div>

                                  {/* Colors */}
                                  <div className="flex gap-2">
                                    <div className="flex-1">
                                      <label className="block text-[10px] text-gray-400 mb-1">Active Color</label>
                                      <input
                                        type="color"
                                        value={getCaptionSettings(short.id).activeColor}
                                        onChange={(e) => updateCaptionSetting(short.id, 'activeColor', e.target.value)}
                                        className="w-full h-7 rounded cursor-pointer bg-transparent border border-gray-600"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-[10px] text-gray-400 mb-1">Text Color</label>
                                      <input
                                        type="color"
                                        value={getCaptionSettings(short.id).inactiveColor}
                                        onChange={(e) => updateCaptionSetting(short.id, 'inactiveColor', e.target.value)}
                                        className="w-full h-7 rounded cursor-pointer bg-transparent border border-gray-600"
                                      />
                                    </div>
                                  </div>

                                  {/* Words per batch */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">
                                      Words per batch: <span className="text-orange-400">{getCaptionSettings(short.id).wordsPerBatch}</span>
                                    </label>
                                    <Slider
                                      value={[getCaptionSettings(short.id).wordsPerBatch]}
                                      onValueChange={(value) => updateCaptionSetting(short.id, 'wordsPerBatch', value[0])}
                                      min={1}
                                      max={5}
                                      step={1}
                                      className="w-full"
                                    />
                                  </div>

                                  {/* Text Transform */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">Text Style</label>
                                    <select
                                      value={getCaptionSettings(short.id).textTransform}
                                      onChange={(e) => updateCaptionSetting(short.id, 'textTransform', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white"
                                    >
                                      <option value="none">Normal</option>
                                      <option value="uppercase">UPPERCASE</option>
                                      <option value="lowercase">lowercase</option>
                                      <option value="capitalize">Capitalize</option>
                                    </select>
                                  </div>
                                </>
                              )}

                              {/* Save Button */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await saveCaptionSettings(short.id);
                                  setCaptionPanelOpenId(null); // Close drawer after save
                                }}
                                disabled={savingCaptionId === short.id}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                              >
                                {savingCaptionId === short.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                Save Settings
                              </button>
                            </div>
                          </div>

                          {/* Music Settings Drawer - Slides from left */}
                          <div
                            className={`absolute top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-700 shadow-2xl z-20 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
                              musicPanelOpenId === short.id ? 'translate-x-0' : '-translate-x-full'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Drawer Header */}
                            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Music className="w-4 h-4 text-orange-500" />
                                <span className="text-sm font-semibold text-white">Background Music</span>
                              </div>
                              <button
                                onClick={() => {
                                  setMusicPanelOpenId(null);
                                  stopMusicPreview();
                                }}
                                className="p-1 hover:bg-gray-700 rounded transition-colors"
                              >
                                <X className="w-4 h-4 text-gray-400" />
                              </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="p-3 space-y-4">
                              {/* Enable/Disable */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-300">Enable Music</span>
                                <button
                                  onClick={() => {
                                    const currentEnabled = getMusicSettings(short.id).enabled;
                                    updateMusicSetting(short.id, 'enabled', !currentEnabled);
                                  }}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                    getMusicSettings(short.id).enabled ? 'bg-orange-600' : 'bg-gray-600'
                                  }`}
                                >
                                  <span
                                    className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                                    style={{ transform: getMusicSettings(short.id).enabled ? 'translateX(18px)' : 'translateX(2px)' }}
                                  />
                                </button>
                              </div>

                              {getMusicSettings(short.id).enabled && (
                                <>
                                  {/* Volume Slider */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">
                                      Volume: <span className="text-orange-400">{getMusicSettings(short.id).volume}%</span>
                                    </label>
                                    <Slider
                                      value={[getMusicSettings(short.id).volume]}
                                      onValueChange={(value) => {
                                        updateMusicSetting(short.id, 'volume', value[0]);
                                        // Update playing audio volume in real-time
                                        updateBgMusicVolume(short.id, value[0]);
                                      }}
                                      min={0}
                                      max={100}
                                      step={1}
                                      className="w-full"
                                    />
                                  </div>

                                  {/* Music Library */}
                                  <div>
                                    <label className="block text-[10px] text-gray-400 mb-2">Select Track</label>
                                    {loadingMusicLibrary ? (
                                      <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                      </div>
                                    ) : musicLibrary.length === 0 ? (
                                      <div className="text-xs text-gray-500 text-center py-4">
                                        No music tracks available
                                      </div>
                                    ) : (
                                      <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {musicLibrary.map((track) => (
                                          <div
                                            key={track.id}
                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                              getMusicSettings(short.id).music_id === track.id
                                                ? 'bg-orange-600/20 border border-orange-600'
                                                : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                                            }`}
                                            onClick={() => {
                                              updateMusicSetting(short.id, 'music_id', track.id);
                                              // Store the track URL for playback
                                              musicTrackUrlsRef.current.set(track.id, track.url);
                                            }}
                                          >
                                            {/* Play/Pause Preview */}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMusicPreview(track);
                                              }}
                                              className="p-1 hover:bg-gray-600 rounded transition-colors"
                                            >
                                              {previewingMusicId === track.id ? (
                                                <Pause className="w-3 h-3 text-orange-400" />
                                              ) : (
                                                <Play className="w-3 h-3 text-gray-400" />
                                              )}
                                            </button>

                                            {/* Track info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs text-white truncate">{track.name}</div>
                                              <div className="text-[10px] text-gray-500">
                                                {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}
                                              </div>
                                            </div>

                                            {/* Selected indicator */}
                                            {getMusicSettings(short.id).music_id === track.id && (
                                              <Check className="w-3 h-3 text-orange-400" />
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Clear selection */}
                                  {getMusicSettings(short.id).music_id && (
                                    <button
                                      onClick={() => updateMusicSetting(short.id, 'music_id', null)}
                                      className="w-full py-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors flex items-center justify-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      Remove Music
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Save Button */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await saveMusicSettings(short.id);
                                  setMusicPanelOpenId(null);
                                  stopMusicPreview();
                                }}
                                disabled={savingMusicId === short.id}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                              >
                                {savingMusicId === short.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                Save Settings
                              </button>
                            </div>
                          </div>

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
        </div>
      </div>
    </div>
  );
}
