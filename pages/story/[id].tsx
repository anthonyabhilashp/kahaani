import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Slider } from "../../components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { ArrowLeft, Play, Pause, Download, Volume2, VolumeX, Maximize, Loader2, ImageIcon, Image, Pencil, Trash2, Check, X, PlayCircle, ChevronDown, Plus, Type, Music, Upload, Sparkles } from "lucide-react";
import { WordByWordCaption, SimpleCaption, type WordTimestamp } from "../../components/WordByWordCaption";
import { EffectSelectionModal } from "../../components/EffectSelectionModal";
import type { EffectType } from "../../lib/videoEffects";
import { getEffectAnimationClass } from "../../lib/videoEffects";

type Scene = {
  id?: string;
  text: string;
  order: number;
  image_url?: string;
  audio_url?: string;
  voice_id?: string;
  duration?: number;
  word_timestamps?: WordTimestamp[] | null;
  last_modified_at?: string;
  created_at?: string;
  image_generated_at?: string;
  audio_generated_at?: string;
  scene_text_modified_at?: string;
  effects?: { motion?: string };
};
type Video = {
  video_url: string;
  is_valid?: boolean;
  duration?: number;
};

// Placeholder component for missing images
const ImagePlaceholder = ({ className = "", alt = "No image" }: { className?: string; alt?: string }) => (
  <div className={`${className} bg-gray-100 border border-gray-200 flex flex-col items-center justify-center text-gray-400`}>
    <ImageIcon size={16} />
    <span className="text-[8px] mt-1 font-medium">No Image</span>
  </div>
);

export default function StoryDetailsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [story, setStory] = useState<any>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [video, setVideo] = useState<Video | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingAudios, setGeneratingAudios] = useState(false);
  const [generatingSceneImage, setGeneratingSceneImage] = useState<Set<number>>(new Set());
  const [generatingSceneAudio, setGeneratingSceneAudio] = useState<Set<number>>(new Set());
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [imageStyle, setImageStyle] = useState<string>("cinematic illustration");
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [modifiedScenes, setModifiedScenes] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<number | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [volume, setVolume] = useState(0); // Start muted
  const [lastVolume, setLastVolume] = useState(0.7); // Remember last volume setting
  const [mediaPreloaded, setMediaPreloaded] = useState(false);
  const [preloadedAudio, setPreloadedAudio] = useState<{[key: number]: HTMLAudioElement}>({});
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [sceneProgress, setSceneProgress] = useState(0); // Current scene progress (0 to scene duration)
  const [sceneDuration, setSceneDuration] = useState(0); // Current scene's audio duration
  const [totalProgress, setTotalProgress] = useState(0); // Cumulative progress across all scenes
  const [isSeeking, setIsSeeking] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // Current playback time for word-by-word captions
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Track currently playing audio
  const captionSettingsLoadedRef = useRef(false); // Track if caption settings have been loaded from DB
  const bgMusicSettingsLoadedRef = useRef(false); // Track if background music settings have been loaded from DB
  const hasFetchedRef = useRef(false); // Track if story has been fetched to prevent duplicates
  const currentStoryIdRef = useRef<string | null>(null); // Track current story ID

  // Effect selection modal state
  const [effectModalOpen, setEffectModalOpen] = useState(false);
  const [selectedEffectScene, setSelectedEffectScene] = useState<number | null>(null);

  // Helper function to calculate total video duration
  const getTotalDuration = () => {
    return scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0);
  };

  // Helper function to get scene start times (cumulative)
  const getSceneStartTimes = () => {
    const startTimes: number[] = [];
    let cumulative = 0;
    scenes.forEach((scene) => {
      startTimes.push(cumulative);
      cumulative += scene.duration || 0;
    });
    return startTimes;
  };

  // Helper function to find which scene a given time belongs to
  const getSceneAtTime = (time: number): { sceneIndex: number; sceneTime: number } => {
    const startTimes = getSceneStartTimes();
    for (let i = 0; i < scenes.length; i++) {
      const start = startTimes[i];
      const end = start + (scenes[i].duration || 0);
      if (time >= start && time < end) {
        return { sceneIndex: i, sceneTime: time - start };
      }
    }
    // If past end, return last scene
    const lastIndex = scenes.length - 1;
    return { sceneIndex: lastIndex, sceneTime: scenes[lastIndex]?.duration || 0 };
  };

  // Helper function to get regeneration message for a scene
  const getRegenerationMessage = (scene: Scene): string => {
    if (!scene.scene_text_modified_at) return "";

    const textModified = new Date(scene.scene_text_modified_at).getTime();
    const imageGenerated = scene.image_generated_at ? new Date(scene.image_generated_at).getTime() : 0;
    const audioGenerated = scene.audio_generated_at ? new Date(scene.audio_generated_at).getTime() : 0;

    const imageOutdated = scene.image_url && textModified > imageGenerated;
    const audioOutdated = scene.audio_url && textModified > audioGenerated;

    if (imageOutdated && audioOutdated) {
      return "Scene updated. Consider regenerating image and audio, if needed.";
    } else if (imageOutdated) {
      return "Scene updated. Consider regenerating image, if needed.";
    } else if (audioOutdated) {
      return "Scene updated. Consider regenerating audio, if needed.";
    }

    return "";
  };

  // Helper function to check if image is outdated
  const isImageOutdated = (scene: Scene): boolean => {
    if (!scene.scene_text_modified_at || !scene.image_url) return false;
    const textModified = new Date(scene.scene_text_modified_at).getTime();
    const imageGenerated = scene.image_generated_at ? new Date(scene.image_generated_at).getTime() : 0;
    return textModified > imageGenerated;
  };

  // Helper function to check if audio is outdated
  const isAudioOutdated = (scene: Scene): boolean => {
    if (!scene.scene_text_modified_at || !scene.audio_url) return false;
    const textModified = new Date(scene.scene_text_modified_at).getTime();
    const audioGenerated = scene.audio_generated_at ? new Date(scene.audio_generated_at).getTime() : 0;
    return textModified > audioGenerated;
  };

  // Helper function to get audio button tooltip
  const getAudioButtonTooltip = (scene: Scene): string => {
    if (!scene.audio_url) {
      return "Click to generate audio narration for this scene";
    } else if (isAudioOutdated(scene)) {
      return "Audio generated, but scene text was updated since then. Consider regenerating.";
    } else {
      return "Audio is up-to-date. Click to regenerate with a different voice.";
    }
  };

  // Helper function to get image button tooltip
  const getImageButtonTooltip = (scene: Scene): string => {
    if (!scene.image_url) {
      return "Click to generate an AI image for this scene";
    } else if (isImageOutdated(scene)) {
      return "Image generated, but scene text was updated since then. Consider regenerating.";
    } else {
      return "Image is up-to-date. Click to regenerate with different settings.";
    }
  };

  // Audio drawer state
  const [audioDrawerOpen, setAudioDrawerOpen] = useState(false);
  const [audioDrawerScene, setAudioDrawerScene] = useState<number | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("21m00Tcm4TlvDq8ikWAM"); // Default voice
  const [voices, setVoices] = useState<Array<{id: string; name: string; preview_url?: string}>>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceListRef = useRef<HTMLDivElement | null>(null);

  // Scene thumbnail audio playback
  const [playingThumbnailAudio, setPlayingThumbnailAudio] = useState<number | null>(null);
  const thumbnailAudioRef = useRef<HTMLAudioElement | null>(null);

  // Image drawer state
  const [imageDrawerOpen, setImageDrawerOpen] = useState(false);
  const [imageDrawerScene, setImageDrawerScene] = useState<number | null>(null);
  const [selectedImageStyle, setSelectedImageStyle] = useState<string>("cinematic movie still, dramatic lighting, film grain");
  const [imageInstructions, setImageInstructions] = useState<string>("");
  const [bulkImageDrawerOpen, setBulkImageDrawerOpen] = useState(false);
  const [bulkAudioDrawerOpen, setBulkAudioDrawerOpen] = useState(false);
  const [loadingSampleImages, setLoadingSampleImages] = useState(false);
  const [sampleImagesLoaded, setSampleImagesLoaded] = useState(false);
  const [storyVoicePopoverOpen, setStoryVoicePopoverOpen] = useState(false);
  const [voiceUpdateConfirmOpen, setVoiceUpdateConfirmOpen] = useState(false);
  const [pendingVoiceId, setPendingVoiceId] = useState<string>("");
  const [pendingVoiceName, setPendingVoiceName] = useState("");
  const [aspectRatioPopoverOpen, setAspectRatioPopoverOpen] = useState(false);
  const [addSceneDialogOpen, setAddSceneDialogOpen] = useState(false);
  const [addScenePosition, setAddScenePosition] = useState<number | null>(null);
  const [newSceneText, setNewSceneText] = useState("");
  const [addingScene, setAddingScene] = useState(false);
  const [captionsDrawerOpen, setCaptionsDrawerOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionPositionFromBottom, setCaptionPositionFromBottom] = useState(20); // Default 20% from bottom (0-100 range)
  const [captionFontSize, setCaptionFontSize] = useState(20); // Good default for readability
  const [captionFontWeight, setCaptionFontWeight] = useState(700); // Bold by default
  const [captionFontFamily, setCaptionFontFamily] = useState("Montserrat"); // Default font
  const [captionActiveColor, setCaptionActiveColor] = useState("#FFEB3B"); // Yellow highlight
  const [captionInactiveColor, setCaptionInactiveColor] = useState("#FFFFFF"); // White
  const [captionWordsPerBatch, setCaptionWordsPerBatch] = useState(3); // Default 3 words at a time
  const [captionTextTransform, setCaptionTextTransform] = useState<"none" | "uppercase" | "lowercase" | "capitalize">("none");
  const [leftPanelView, setLeftPanelView] = useState<"scenes" | "captions" | "background_music">("scenes");

  // Background Music State
  const [bgMusicEnabled, setBgMusicEnabled] = useState(false);
  const [bgMusicId, setBgMusicId] = useState<string | null>(null);
  const [bgMusicUrl, setBgMusicUrl] = useState<string | null>(null);
  const [bgMusicName, setBgMusicName] = useState<string | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(30); // Default 30% volume
  const [bgMusicUploading, setBgMusicUploading] = useState(false);
  const [bgMusicPlaying, setBgMusicPlaying] = useState(false);
  const bgMusicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Music Library State
  const [musicLibrary, setMusicLibrary] = useState<any[]>([]);
  const [musicLibraryLoading, setMusicLibraryLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Use ref for immediate cancellation without state delays
  const previewCancelledRef = useRef(false);
  const currentPreviewRef = useRef<Promise<void> | null>(null);
  const volumeRef = useRef(volume); // Track current volume with ref

  // Keep volumeRef in sync with volume state
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Scroll to selected voice when drawer opens (for individual scene)
  useEffect(() => {
    if (audioDrawerOpen && voiceListRef.current && selectedVoiceId) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        const selectedElement = voiceListRef.current?.querySelector(`[data-voice-id="${selectedVoiceId}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [audioDrawerOpen, selectedVoiceId]);

  // Pre-select voice from story when bulk audio drawer opens
  useEffect(() => {
    if (bulkAudioDrawerOpen && story?.voice_id) {
      setSelectedVoiceId(story.voice_id);
      // Scroll to selected voice
      setTimeout(() => {
        const selectedElement = voiceListRef.current?.querySelector(`[data-voice-id="${story.voice_id}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [bulkAudioDrawerOpen, story?.voice_id]);

  // Stop audio when navigating away or unmounting
  useEffect(() => {
    return () => {
      console.log("🧹 Cleaning up: stopping all audio on unmount");
      stopVideoPreview();
    };
  }, []);

  // Update volume for all preloaded audio when volume changes
  useEffect(() => {
    console.log(`🔊 Updating volume to ${volume} for ${Object.keys(preloadedAudio).length} audio elements`);
    Object.values(preloadedAudio).forEach(audio => {
      audio.volume = volume;
    });
  }, [volume, preloadedAudio]);

  // Get preview dimensions based on aspect ratio - Smaller for cleaner look
  const getPreviewDimensions = () => {
    switch (aspectRatio) {
      case "9:16": // Portrait (mobile/vertical)
        return { width: 280, height: 498 }; // 9:16 ratio, compact
      case "16:9": // Landscape (desktop/horizontal)
        return { width: 498, height: 280 }; // 16:9 ratio, compact
      case "1:1": // Square
        return { width: 400, height: 400 }; // 1:1 ratio, compact
      default:
        return { width: 400, height: 400 };
    }
  };

  // Preload images and audio for better performance
  const preloadMedia = useCallback(async (scenes: Scene[]) => {
    console.log("🚀 Preloading media assets...");
    
    try {
      // Preload images from scenes
      const imagePromises = scenes
        .filter(scene => scene.image_url)
        .map(scene => {
          return new Promise((resolve) => {
            const image = document.createElement('img');
            image.onload = () => resolve(void 0);
            image.onerror = () => resolve(void 0); // Continue even if image fails
            image.src = scene.image_url!;
          });
        });
      
      // Preload audio files from scenes and store them
      const audioCache: {[key: number]: HTMLAudioElement} = {};
      const audioPromises = scenes
        .filter((scene, index) => scene.audio_url)
        .map((scene, sceneIndex) => {
          return new Promise((resolve) => {
            const actualIndex = scenes.findIndex(s => s === scene);
            const audioElement = new Audio(scene.audio_url!);
            audioElement.volume = volume; // Set initial volume
            audioElement.oncanplaythrough = () => {
              audioCache[actualIndex] = audioElement;
              resolve(void 0);
            };
            audioElement.onerror = () => resolve(void 0); // Continue even if audio fails
            audioElement.preload = 'metadata';
          });
        });
      
      // Wait for all media to preload
      await Promise.all([...imagePromises, ...audioPromises]);
      
      // Save preloaded audio elements
      setPreloadedAudio(audioCache);
      setMediaPreloaded(true);
      console.log("✅ Media preloading completed - cached", Object.keys(audioCache).length, "audio files");
      
    } catch (err) {
      console.error("⚠️ Media preloading error:", err);
      setMediaPreloaded(true); // Set as complete even if errors
    }
  }, []); // Remove mediaPreloaded dependency

  const fetchStory = useCallback(async () => {
    if (!id) return;
    
    console.log("📡 Fetching story details for ID:", id);
    setLoading(true);
    
    try {
      const res = await fetch(`/api/get_story_details?id=${id}`);
      const data = await res.json();
      console.log("📊 Story data received:", data);

      // Add cache-busting timestamp to all images and audio to force browser to reload
      const timestamp = Date.now();
      const scenesWithTimestamp = (data.scenes || []).map((scene: any) => ({
        ...scene,
        image_url: scene.image_url ? `${scene.image_url}?t=${timestamp}` : scene.image_url,
        audio_url: scene.audio_url ? `${scene.audio_url}?t=${timestamp}` : scene.audio_url
      }));

      setStory(data.story);
      setScenes(scenesWithTimestamp);
      setVideo(data.video);

      // Initialize modifiedScenes from database - scenes where scene_text_modified_at is newer than generation timestamps
      const initialModifiedScenes = new Set<number>();
      scenesWithTimestamp.forEach((scene: any, index: number) => {
        if (scene.scene_text_modified_at) {
          const textModified = new Date(scene.scene_text_modified_at).getTime();
          const imageGenerated = scene.image_generated_at ? new Date(scene.image_generated_at).getTime() : 0;
          const audioGenerated = scene.audio_generated_at ? new Date(scene.audio_generated_at).getTime() : 0;

          // Show modified badge if scene text was edited after image or audio was generated
          if ((scene.image_url && textModified > imageGenerated) ||
              (scene.audio_url && textModified > audioGenerated)) {
            initialModifiedScenes.add(index);
          }
        }
      });
      setModifiedScenes(initialModifiedScenes);
      console.log("📝 Initialized modified scenes:", Array.from(initialModifiedScenes));

      // Load caption settings from database if available
      if (data.story?.caption_settings) {
        const settings = data.story.caption_settings;
        setCaptionsEnabled(settings.enabled ?? true);
        setCaptionFontFamily(settings.fontFamily ?? "Montserrat");
        setCaptionFontSize(settings.fontSize ?? 20);
        setCaptionFontWeight(settings.fontWeight ?? 700);
        setCaptionPositionFromBottom(settings.positionFromBottom ?? 20);
        setCaptionActiveColor(settings.activeColor ?? "#FFEB3B");
        setCaptionInactiveColor(settings.inactiveColor ?? "#FFFFFF");
        setCaptionWordsPerBatch(settings.wordsPerBatch ?? 3);
        setCaptionTextTransform(settings.textTransform ?? "none");
        console.log("📝 Loaded caption settings from database:", settings);
      }

      // Load background music settings from database if available
      if (data.story?.background_music_settings) {
        const bgSettings = data.story.background_music_settings;
        setBgMusicEnabled(bgSettings.enabled ?? false);
        setBgMusicId(bgSettings.music_id ?? null);
        setBgMusicUrl(bgSettings.music_url ?? null);
        setBgMusicName(bgSettings.music_name ?? null);
        setBgMusicVolume(bgSettings.volume ?? 30);
        console.log("🎵 Loaded background music settings from database:", bgSettings);
      }

      // Load voices if not already loaded (for story voice selector)
      if (voices.length === 0) {
        fetchVoices();
      }

      // Preload media assets after setting state - only if not already preloaded
      if (data.scenes?.length > 0 && !mediaPreloaded) {
        preloadMedia(data.scenes);
      }

    } catch (err) {
      console.error("❌ Error fetching story:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id to prevent infinite loops

  // Fetch story only once when component mounts or id changes
  useEffect(() => {
    // Wait for router to be ready to avoid multiple fetches during hydration
    if (!router.isReady || !id) return;

    // Check if we've already fetched this story ID
    if (hasFetchedRef.current && currentStoryIdRef.current === id) {
      console.log("⏭️ Skipping duplicate fetch for story:", id);
      return;
    }

    // Mark as fetched and store current ID
    hasFetchedRef.current = true;
    currentStoryIdRef.current = id as string;

    // Reset refs when changing stories
    if (currentStoryIdRef.current !== id) {
      captionSettingsLoadedRef.current = false;
      bgMusicSettingsLoadedRef.current = false;
    }

    fetchStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, id]); // Only depend on router.isReady and id

  // Enable auto-save AFTER initial data has been loaded (prevents auto-save on mount)
  useEffect(() => {
    if (story && !captionSettingsLoadedRef.current && !bgMusicSettingsLoadedRef.current) {
      // Wait for next tick to ensure all state updates from fetchStory have completed
      const timer = setTimeout(() => {
        captionSettingsLoadedRef.current = true;
        bgMusicSettingsLoadedRef.current = true;
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [story]);

  // Video validity is now checked automatically via the is_valid flag
  // No need for manual hash checking - database trigger handles it

  // Save caption settings to database
  const saveCaptionSettings = useCallback(async () => {
    if (!id) return;

    const captionSettings = {
      enabled: captionsEnabled,
      fontFamily: captionFontFamily,
      fontSize: captionFontSize,
      fontWeight: captionFontWeight,
      positionFromBottom: captionPositionFromBottom,
      activeColor: captionActiveColor,
      inactiveColor: captionInactiveColor,
      wordsPerBatch: captionWordsPerBatch,
      textTransform: captionTextTransform,
    };

    try {
      const res = await fetch("/api/save_caption_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          caption_settings: captionSettings,
        }),
      });

      if (res.ok) {
        console.log("💾 Caption settings saved successfully");
      } else {
        console.error("❌ Failed to save caption settings");
      }
    } catch (err) {
      console.error("❌ Error saving caption settings:", err);
    }
  }, [
    id,
    captionsEnabled,
    captionFontFamily,
    captionFontSize,
    captionFontWeight,
    captionPositionFromBottom,
    captionActiveColor,
    captionInactiveColor,
    captionWordsPerBatch,
    captionTextTransform,
  ]);

  // Auto-save caption settings when they change (with debouncing)
  useEffect(() => {
    // Don't save on initial load - only save when settings change after initial load
    if (!story || !captionSettingsLoadedRef.current) return;

    const timeoutId = setTimeout(() => {
      saveCaptionSettings();
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    captionsEnabled,
    captionFontFamily,
    captionFontSize,
    captionFontWeight,
    captionPositionFromBottom,
    captionActiveColor,
    captionInactiveColor,
    captionWordsPerBatch,
    captionTextTransform,
    story,
  ]);

  // Fetch music library
  const fetchMusicLibrary = useCallback(async (category?: string) => {
    setMusicLibraryLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.append("category", category);

      const res = await fetch(`/api/get_music_library?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMusicLibrary(data.music_library || []);
        console.log("🎵 Loaded music library:", data.music_library?.length, "tracks");
      } else {
        console.error("❌ Failed to fetch music library");
      }
    } catch (err) {
      console.error("❌ Error fetching music library:", err);
    } finally {
      setMusicLibraryLoading(false);
    }
  }, []);

  // Save background music settings to database
  const saveBgMusicSettings = useCallback(async () => {
    if (!id) return;

    try {
      const res = await fetch("/api/save_background_music_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          music_id: bgMusicId,
          volume: bgMusicVolume,
          enabled: bgMusicEnabled,
        }),
      });

      if (res.ok) {
        console.log("💾 Background music settings saved successfully");
      } else {
        console.error("❌ Failed to save background music settings");
      }
    } catch (err) {
      console.error("❌ Error saving background music settings:", err);
    }
  }, [id, bgMusicId, bgMusicVolume, bgMusicEnabled]);

  // Load music library when background music panel opens
  useEffect(() => {
    if (leftPanelView === "background_music" && musicLibrary.length === 0) {
      fetchMusicLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftPanelView, musicLibrary.length]);

  // Auto-save background music settings when they change
  useEffect(() => {
    // Don't save on initial load - only save when settings change after initial load
    if (!story || !bgMusicSettingsLoadedRef.current) return;

    const timeoutId = setTimeout(() => {
      saveBgMusicSettings();
    }, 1000);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgMusicEnabled, bgMusicVolume, bgMusicId, story]);

  // Handle selecting music from library
  const handleSelectMusicFromLibrary = useCallback((music: any) => {
    setBgMusicId(music.id);
    setBgMusicUrl(music.file_url);
    setBgMusicName(music.name);
    setBgMusicEnabled(true);
    console.log("🎵 Selected music from library:", music.name);
  }, []);

  // Handle background music file upload to library
  const handleBgMusicUpload = async (file: File) => {
    if (!id) return;

    const musicName = prompt("Enter a name for this music track:");
    if (!musicName) return;

    setBgMusicUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", musicName);
      formData.append("category", "other");
      formData.append("uploaded_by", "user");

      const res = await fetch("/api/upload_music_to_library", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        console.log("✅ Background music uploaded to library successfully");

        // Refresh library and select the new music
        await fetchMusicLibrary();
        handleSelectMusicFromLibrary(data.music);
      } else {
        const error = await res.json();
        console.error("❌ Failed to upload background music:", error);
        alert("Failed to upload background music: " + error.error);
      }
    } catch (err) {
      console.error("❌ Error uploading background music:", err);
      alert("Error uploading background music");
    } finally {
      setBgMusicUploading(false);
    }
  };

  // Handle background music playback toggle
  const toggleBgMusicPlayback = () => {
    if (!bgMusicUrl) return;

    if (!bgMusicAudioRef.current) {
      bgMusicAudioRef.current = new Audio(bgMusicUrl);
      bgMusicAudioRef.current.loop = true;
      bgMusicAudioRef.current.volume = bgMusicVolume / 100;
    }

    if (bgMusicPlaying) {
      bgMusicAudioRef.current.pause();
      setBgMusicPlaying(false);
    } else {
      bgMusicAudioRef.current.play();
      setBgMusicPlaying(true);
    }
  };

  // Update bg music volume
  useEffect(() => {
    if (bgMusicAudioRef.current) {
      bgMusicAudioRef.current.volume = bgMusicVolume / 100;
    }
  }, [bgMusicVolume]);

  // Debug state changes
  useEffect(() => {
    console.log("State updated:", {
      scenesCount: scenes.length,
      scenesWithImages: scenes.filter(s => s.image_url).length,
      scenesWithAudio: scenes.filter(s => s.audio_url).length,
      hasVideo: !!video?.video_url,
      generatingImages,
      generatingSceneAudio: generatingSceneAudio.size
    });
  }, [scenes.length, video?.video_url, generatingImages, generatingSceneAudio, scenes]);

  const generateImages = async (style?: string, instructions?: string) => {
    if (!id) return;
    setGeneratingImages(true);
    setBulkImageDrawerOpen(false); // Close drawer when generation starts

    try {
      console.log("Starting image generation for story:", id);
      const res = await fetch("/api/generate_images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          style: style || selectedImageStyle || imageStyle,
          instructions: instructions || imageInstructions
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Image generation failed");
      }
      const result = await res.json();
      console.log("✅ Image generation completed:", result);

      // Update scenes with new images, using cache-busting timestamp
      const timestamp = Date.now();
      const generatedTimestamp = new Date().toISOString();
      const updatedScenes = scenes.map((scene) => {
        // Find the matching updated scene from API response
        const updatedScene = result.updated_scenes?.find((s: any) => s.id === scene.id);
        if (updatedScene && updatedScene.image_url) {
          return {
            ...scene,
            image_url: `${updatedScene.image_url}?t=${timestamp}`,
            image_generated_at: generatedTimestamp
          };
        }
        return scene;
      });
      setScenes(updatedScenes);

      // Recalculate modified scenes for all updated scenes
      const updatedModifiedScenes = new Set(modifiedScenes);
      updatedScenes.forEach((scene, index) => {
        if (scene.scene_text_modified_at && scene.image_url) {
          const textModified = new Date(scene.scene_text_modified_at).getTime();
          const imageGenerated = scene.image_generated_at ? new Date(scene.image_generated_at).getTime() : 0;
          const audioGenerated = scene.audio_generated_at ? new Date(scene.audio_generated_at).getTime() : 0;

          // Check if still needs regeneration
          const needsRegen = (scene.audio_url && textModified > audioGenerated);
          if (needsRegen) {
            updatedModifiedScenes.add(index);
          } else {
            updatedModifiedScenes.delete(index);
          }
        } else if (scene.image_url) {
          updatedModifiedScenes.delete(index);
        }
      });
      setModifiedScenes(updatedModifiedScenes);

      // Don't reset media preload state or re-preload audio
    } catch (err) {
      console.error("Image generation error:", err);
      alert(`Image generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGeneratingImages(false);
    }
  };

  const generateAllAudio = async (voiceId?: string) => {
    if (!id) return;
    setGeneratingAudios(true);
    setBulkAudioDrawerOpen(false); // Close drawer when generation starts

    try {
      const finalVoiceId = voiceId || story?.voice_id || "21m00Tcm4TlvDq8ikWAM";
      console.log("🎙️ Starting bulk audio generation");
      console.log("  Story ID:", id);
      console.log("  Selected Voice ID:", voiceId);
      console.log("  Story Voice ID:", story?.voice_id);
      console.log("  Final Voice ID:", finalVoiceId);

      const res = await fetch("/api/generate_all_audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          voice_id: finalVoiceId
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Audio generation failed");
      }
      const result = await res.json();
      console.log("✅ Bulk audio generation completed:", result);

      // Update scenes with new audio, using cache-busting timestamp
      const timestamp = Date.now();
      const generatedTimestamp = new Date().toISOString();
      const updatedScenes = scenes.map((scene) => {
        // Find the matching updated scene from API response
        const updatedScene = result.updated_scenes?.find((s: any) => s.id === scene.id);
        if (updatedScene && updatedScene.audio_url && !updatedScene.error) {
          return {
            ...scene,
            audio_url: `${updatedScene.audio_url}?t=${timestamp}`,
            voice_id: updatedScene.voice_id,
            duration: updatedScene.duration,
            word_timestamps: updatedScene.word_timestamps,
            audio_generated_at: generatedTimestamp
          };
        }
        return scene;
      });
      setScenes(updatedScenes);

      // Recalculate modified scenes
      const updatedModifiedScenes = new Set(modifiedScenes);
      updatedScenes.forEach((scene, index) => {
        if (scene.scene_text_modified_at && scene.audio_url) {
          const textModified = new Date(scene.scene_text_modified_at).getTime();
          const audioGenerated = scene.audio_generated_at ? new Date(scene.audio_generated_at).getTime() : 0;

          // Check if still needs regeneration
          const needsRegen = textModified > audioGenerated;
          if (needsRegen) {
            updatedModifiedScenes.add(index);
          } else {
            updatedModifiedScenes.delete(index);
          }
        } else if (scene.audio_url) {
          updatedModifiedScenes.delete(index);
        }
      });
      setModifiedScenes(updatedModifiedScenes);

      // Preload all new audio files
      await preloadMedia(updatedScenes);
    } catch (err) {
      console.error("Bulk audio generation error:", err);
      alert(`Bulk audio generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGeneratingAudios(false);
    }
  };

  const loadSampleImages = async () => {
    setLoadingSampleImages(true);
    console.log("🎨 Loading sample images for all styles...");

    try {
      const res = await fetch("/api/generate_sample_images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate sample images");
      }

      const result = await res.json();
      console.log("✅ Sample images loaded:", result);

      setSampleImagesLoaded(true);
      alert(`Successfully generated ${result.successful}/${result.total} sample images!`);

    } catch (err) {
      console.error("❌ Sample image generation error:", err);
      alert(`Failed to load sample images: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingSampleImages(false);
    }
  };

  const generateSceneImage = async (sceneIndex: number, style?: string, instructions?: string) => {
    if (!scenes[sceneIndex]) return;

    const newGenerating = new Set(generatingSceneImage);
    newGenerating.add(sceneIndex);
    setGeneratingSceneImage(newGenerating);

    // Close the drawer when generation starts
    setImageDrawerOpen(false);

    try {
      console.log("Starting image generation for scene:", sceneIndex);
      const res = await fetch("/api/generate_scene_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_id: scenes[sceneIndex].id,
          style: style || selectedImageStyle || imageStyle,
          instructions: instructions || imageInstructions
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Scene image generation failed");
      }
      const result = await res.json();
      console.log("Scene image generation completed:", result);

      // Update the specific scene with the new image URL and timestamp
      // Add cache-busting timestamp to force browser to reload the image
      const imageUrlWithTimestamp = result.image_url ? `${result.image_url}?t=${Date.now()}` : result.image_url;
      console.log("🔄 Updating scene", sceneIndex, "with cache-busted URL:", imageUrlWithTimestamp);
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        image_url: imageUrlWithTimestamp,
        image_generated_at: new Date().toISOString()
      };
      setScenes(updatedScenes);
      console.log("✅ Scenes state updated, thumbnail should refresh now");

      // Recalculate modified scenes without full reload
      const updatedModifiedScenes = new Set(modifiedScenes);
      const scene = updatedScenes[sceneIndex];
      if (scene.scene_text_modified_at) {
        const textModified = new Date(scene.scene_text_modified_at).getTime();
        const imageGenerated = new Date().getTime(); // Just generated now
        const audioGenerated = scene.audio_generated_at ? new Date(scene.audio_generated_at).getTime() : 0;

        // Check if still needs regeneration
        const needsRegen = (scene.audio_url && textModified > audioGenerated);
        if (needsRegen) {
          updatedModifiedScenes.add(sceneIndex);
        } else {
          updatedModifiedScenes.delete(sceneIndex);
        }
      } else {
        updatedModifiedScenes.delete(sceneIndex);
      }
      setModifiedScenes(updatedModifiedScenes);

    } catch (err) {
      console.error("Scene image generation error:", err);
      alert(`Image generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      const newGenerating = new Set(generatingSceneImage);
      newGenerating.delete(sceneIndex);
      setGeneratingSceneImage(newGenerating);
    }
  };

  // Fetch ElevenLabs voices
  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const res = await fetch("/api/get_voices");
      const data = await res.json();
      setVoices(data.voices || []);
    } catch (error) {
      console.error("Error fetching voices:", error);
    } finally {
      setLoadingVoices(false);
    }
  };

  // Open audio drawer
  const openAudioDrawer = (sceneIndex: number) => {
    setAudioDrawerScene(sceneIndex);

    // Voice selection hierarchy:
    // 1. Scene-specific voice_id (if set and valid - must be a valid ElevenLabs voice ID format)
    // 2. Story default voice_id
    // 3. Global default voice_id
    const scene = scenes[sceneIndex];

    // Check if scene has a valid voice_id (should be alphanumeric, not "text" or other invalid values)
    const isValidVoiceId = (voiceId: string | undefined) => {
      if (!voiceId) return false;
      // Valid ElevenLabs voice IDs are typically alphanumeric strings of reasonable length
      // Filter out invalid values like "text", empty strings, etc.
      return voiceId.length > 10 && /^[a-zA-Z0-9]+$/.test(voiceId);
    };

    const sceneVoiceId = isValidVoiceId(scene?.voice_id) ? scene.voice_id : null;
    const voiceToUse = sceneVoiceId || story?.voice_id || "21m00Tcm4TlvDq8ikWAM";

    console.log("🎤 Opening audio drawer for scene", sceneIndex);
    console.log("🎤 Scene voice_id:", scene?.voice_id, "Valid:", isValidVoiceId(scene?.voice_id));
    console.log("🎤 Story voice_id:", story?.voice_id);
    console.log("🎤 Voice to use:", voiceToUse);

    setSelectedVoiceId(voiceToUse);

    setAudioDrawerOpen(true);
    if (voices.length === 0) {
      fetchVoices();
    }
  };

  // Open image drawer
  const openImageDrawer = (sceneIndex: number) => {
    setImageDrawerScene(sceneIndex);

    // Style selection hierarchy:
    // 1. Scene-specific style (not implemented yet)
    // 2. Story default style
    // 3. Global default style
    const styleToUse = story?.default_image_style || "cinematic illustration";
    setSelectedImageStyle(styleToUse);

    // Load story's default instructions if available
    setImageInstructions(story?.image_instructions || "");

    setImageDrawerOpen(true);
  };

  // Open voice update confirmation dialog
  const openVoiceUpdateConfirm = (voiceId: string) => {
    const voiceName = voices.find(v => v.id === voiceId)?.name || "Unknown Voice";
    setPendingVoiceId(voiceId);
    setPendingVoiceName(voiceName);
    setStoryVoicePopoverOpen(false);
    setVoiceUpdateConfirmOpen(true);
  };

  // Update story voice (called after confirmation)
  const updateStoryVoice = async () => {
    try {
      const res = await fetch("/api/update_story_voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          voice_id: pendingVoiceId
        }),
      });

      if (res.ok) {
        setStory({ ...story, voice_id: pendingVoiceId });
        setVoiceUpdateConfirmOpen(false);
        console.log(`✅ Updated story default voice to: ${pendingVoiceId}`);
      } else {
        alert("Failed to update voice. Please try again.");
      }
    } catch (error) {
      console.error("Error updating story voice:", error);
      alert("Failed to update voice. Please try again.");
    }
  };

  // Play voice preview
  const playVoicePreview = (voiceId: string, previewUrl?: string) => {
    if (!previewUrl) return;

    // Stop any currently playing preview
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current = null;
    }

    // If clicking the same voice, just stop
    if (playingPreviewId === voiceId) {
      setPlayingPreviewId(null);
      return;
    }

    // Play new preview
    const audio = new Audio(previewUrl);
    voicePreviewAudioRef.current = audio;
    setPlayingPreviewId(voiceId);

    audio.play();
    audio.onended = () => {
      setPlayingPreviewId(null);
      voicePreviewAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingPreviewId(null);
      voicePreviewAudioRef.current = null;
    };
  };

  // Toggle thumbnail audio playback
  const toggleThumbnailAudio = (sceneIndex: number, audioUrl: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent scene selection

    // If clicking the same audio, stop it
    if (playingThumbnailAudio === sceneIndex && thumbnailAudioRef.current) {
      thumbnailAudioRef.current.pause();
      thumbnailAudioRef.current = null;
      setPlayingThumbnailAudio(null);
      return;
    }

    // Stop any currently playing thumbnail audio
    if (thumbnailAudioRef.current) {
      thumbnailAudioRef.current.pause();
      thumbnailAudioRef.current = null;
    }

    // Play new audio
    const audio = new Audio(audioUrl);
    thumbnailAudioRef.current = audio;
    setPlayingThumbnailAudio(sceneIndex);

    audio.play();
    audio.onended = () => {
      setPlayingThumbnailAudio(null);
      thumbnailAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingThumbnailAudio(null);
      thumbnailAudioRef.current = null;
    };
  };

  const generateSceneAudio = async (sceneIndex: number, voiceId?: string) => {
    if (!scenes[sceneIndex]) return;

    const newGenerating = new Set(generatingSceneAudio);
    newGenerating.add(sceneIndex);
    setGeneratingSceneAudio(newGenerating);

    try {
      console.log("Starting audio generation for scene:", sceneIndex, "with voice:", voiceId || selectedVoiceId);
      const res = await fetch("/api/generate_audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_id: scenes[sceneIndex].id,
          voice_id: voiceId || selectedVoiceId
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Scene audio generation failed");
      }
      const result = await res.json();
      console.log("Scene audio generation completed:", result);

      // Update the specific scene with the new audio URL, voice_id, duration, word_timestamps, and timestamp
      // Add cache-busting timestamp to force browser to reload the audio
      const audioUrlWithTimestamp = result.audio_url ? `${result.audio_url}?t=${Date.now()}` : result.audio_url;
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        audio_url: audioUrlWithTimestamp,
        voice_id: result.voice_id || voiceId || selectedVoiceId,
        duration: result.duration,
        word_timestamps: result.word_timestamps || null,
        audio_generated_at: new Date().toISOString()
      };
      setScenes(updatedScenes);

      // Update preloaded audio cache with new audio (add cache buster to force reload)
      if (result.audio_url) {
        const cacheBustedUrl = `${result.audio_url}?t=${Date.now()}`;
        const audioElement = new Audio(cacheBustedUrl);
        audioElement.preload = 'metadata';
        audioElement.oncanplaythrough = () => {
          setPreloadedAudio(prev => ({
            ...prev,
            [sceneIndex]: audioElement
          }));
          console.log(`✅ New audio preloaded for scene ${sceneIndex + 1} with cache-busted URL`);
        };
        audioElement.load(); // Force load the new audio
      }

      // Recalculate modified scenes without full reload
      const updatedModifiedScenes = new Set(modifiedScenes);
      const scene = updatedScenes[sceneIndex];
      if (scene.scene_text_modified_at) {
        const textModified = new Date(scene.scene_text_modified_at).getTime();
        const imageGenerated = scene.image_generated_at ? new Date(scene.image_generated_at).getTime() : 0;
        const audioGenerated = new Date().getTime(); // Just generated now

        // Check if still needs regeneration
        const needsRegen = (scene.image_url && textModified > imageGenerated);
        if (needsRegen) {
          updatedModifiedScenes.add(sceneIndex);
        } else {
          updatedModifiedScenes.delete(sceneIndex);
        }
      } else {
        updatedModifiedScenes.delete(sceneIndex);
      }
      setModifiedScenes(updatedModifiedScenes);

    } catch (err) {
      console.error("Scene audio generation error:", err);
      alert(`Scene audio generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      const newGenerating = new Set(generatingSceneAudio);
      newGenerating.delete(sceneIndex);
      setGeneratingSceneAudio(newGenerating);
    }
  };

  const generateVideo = async () => {
    if (!id) return;
    setGeneratingVideo(true);
    try {
      console.log("🎬 Starting video export for story:", id, "with aspect ratio:", aspectRatio);
      const res = await fetch("/api/generate_video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          aspect_ratio: aspectRatio,
          captions: captionsEnabled ? {
            enabled: true,
            fontFamily: captionFontFamily,
            fontSize: captionFontSize,
            fontWeight: captionFontWeight,
            positionFromBottom: captionPositionFromBottom,
            activeColor: captionActiveColor,
            inactiveColor: captionInactiveColor,
            wordsPerBatch: captionWordsPerBatch,
            textTransform: captionTextTransform
          } : { enabled: false },
          background_music: bgMusicEnabled && bgMusicUrl ? {
            enabled: true,
            music_url: bgMusicUrl,
            volume: bgMusicVolume
          } : { enabled: false }
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Video generation failed");
      }
      const result = await res.json();
      console.log("✅ Video export completed:", result);

      // Update video state
      setVideo({
        video_url: result.video_url,
        is_valid: result.is_valid,
        duration: result.duration
      });

      // Auto-download the video
      const link = document.createElement('a');
      link.href = result.video_url;
      link.download = `${story?.title || 'story'}-${aspectRatio}.mp4`;
      link.click();

      alert(`✅ Video exported successfully! Duration: ${result.duration?.toFixed(1)}s`);
    } catch (err) {
      console.error("❌ Video export error:", err);
      alert(`Video export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGeneratingVideo(false);
    }
  };

  const stopVideoPreview = () => {
    console.log("🛑 Stopping video preview");
    previewCancelledRef.current = true;
    setIsPlayingPreview(false);
    setIsSeeking(false);

    // Stop preloaded audio elements
    Object.values(preloadedAudio).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Also stop any other audio elements as fallback
    const audios = document.querySelectorAll('audio');
    audios.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Clear progress tracking
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setSceneProgress(0);
    setSceneDuration(0);
    setCurrentTime(0);
    currentAudioRef.current = null;
  };

  // Seek to a specific time in the total video timeline
  const seekToTotalTime = async (targetTotalTime: number) => {
    console.log(`⏩ Seeking to ${targetTotalTime.toFixed(1)}s in total timeline`);
    setIsSeeking(true);

    // Find which scene this time belongs to
    const { sceneIndex, sceneTime } = getSceneAtTime(targetTotalTime);

    console.log(`📍 Time ${targetTotalTime.toFixed(1)}s is in scene ${sceneIndex + 1} at ${sceneTime.toFixed(1)}s`);

    // If we're in a different scene, stop current and switch
    if (sceneIndex !== selectedScene) {
      const wasPlaying = isPlayingPreview;

      // Stop current playback
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // Switch to target scene
      setSelectedScene(sceneIndex);

      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // If was playing, resume from new position
      if (wasPlaying && preloadedAudio[sceneIndex]) {
        const audio = preloadedAudio[sceneIndex];
        audio.currentTime = sceneTime;
        audio.volume = volume;
        currentAudioRef.current = audio;

        const sceneStartTimes = getSceneStartTimes();
        const cumulativeStart = sceneStartTimes[sceneIndex];

        setSceneDuration(audio.duration);
        setSceneProgress(sceneTime);
        setTotalProgress(cumulativeStart + sceneTime);

        // Start progress tracking
        progressIntervalRef.current = setInterval(() => {
          if (audio && !audio.paused) {
            const currentSceneTime = audio.currentTime;
            setSceneProgress(currentSceneTime);
            setTotalProgress(cumulativeStart + currentSceneTime);
          }
        }, 100);

        await audio.play();
      }
    } else {
      // Same scene, just seek within it
      if (currentAudioRef.current) {
        const audio = currentAudioRef.current;
        const wasPlaying = !audio.paused;

        audio.pause();
        audio.currentTime = sceneTime;
        setSceneProgress(sceneTime);
        setTotalProgress(targetTotalTime);

        if (wasPlaying) {
          try {
            await audio.play();
          } catch (err) {
            console.error("Resume play error:", err);
          }
        }
      }
    }

    setIsSeeking(false);
  };

  // Legacy function for seeking within current scene (kept for compatibility)
  const seekToTime = async (targetTime: number) => {
    if (!currentAudioRef.current) return;

    console.log(`⏩ Seeking to ${targetTime.toFixed(1)}s in current scene`);
    setIsSeeking(true);

    const audio = currentAudioRef.current;
    const wasPlaying = !audio.paused;

    audio.pause();
    audio.currentTime = targetTime;
    setSceneProgress(targetTime);

    // Also update total progress
    const sceneStartTimes = getSceneStartTimes();
    const cumulativeStart = sceneStartTimes[selectedScene];
    setTotalProgress(cumulativeStart + targetTime);

    if (wasPlaying) {
      try {
        await audio.play();
      } catch (err) {
        console.error("Resume play error:", err);
      }
    }

    setIsSeeking(false);
  };

  const startVideoPreview = async () => {
    console.log("🎬 Starting video preview from scene:", selectedScene);

    // Stop any existing preview first
    stopVideoPreview();

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));

    // Reset progress
    setSceneProgress(0);

    // Reset cancellation flag and start new preview
    previewCancelledRef.current = false;
    setIsPlayingPreview(true);
    
    const playScene = async (sceneIndex: number) => {
      if (previewCancelledRef.current) return false;

      console.log(`🎬 Playing scene ${sceneIndex + 1}`);
      setSelectedScene(sceneIndex);

      const scene = scenes[sceneIndex];
      if (scene?.audio_url && preloadedAudio[sceneIndex]) {
        const currentVol = volumeRef.current;
        console.log(`🔊 Playing preloaded audio for scene ${sceneIndex + 1} with volume ${currentVol}`);
        const audio = preloadedAudio[sceneIndex];
        audio.volume = currentVol;
        audio.currentTime = 0;
        console.log(`🎵 Audio element volume set to: ${audio.volume}, muted: ${audio.muted}`);

        // Set scene duration and reset progress
        setSceneDuration(audio.duration);
        setSceneProgress(0);
        currentAudioRef.current = audio;

        // Calculate cumulative start time for this scene
        const sceneStartTimes = getSceneStartTimes();
        const cumulativeStart = sceneStartTimes[sceneIndex];

        try {
          // Start progress tracking for this scene
          progressIntervalRef.current = setInterval(() => {
            if (audio && !audio.paused) {
              const currentSceneTime = audio.currentTime;
              setSceneProgress(currentSceneTime);
              // Update total progress (cumulative time across all scenes)
              setTotalProgress(cumulativeStart + currentSceneTime);
              // Update current time for word-by-word captions
              setCurrentTime(currentSceneTime);
            }
          }, 100);

          await audio.play();
          await new Promise<void>((resolve) => {
            const checkCancellation = () => {
              if (previewCancelledRef.current) {
                audio.pause();
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
                return;
              }
              setTimeout(checkCancellation, 100);
            };

            audio.onended = () => {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
              }
              setSceneProgress(0); // Reset for next scene
              setCurrentTime(0); // Reset caption time
              resolve();
            };
            audio.onerror = () => {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
              }
              resolve();
            };

            checkCancellation();
          });
        } catch (err) {
          console.error("Audio play error:", err);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
          // Fallback timing with cancellation check
          for (let i = 0; i < 30 && !previewCancelledRef.current; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setSceneProgress((i + 1) * 0.1);
          }
        }
      } else {
        console.log(`⏱️ No audio for scene ${sceneIndex + 1}, using 3s default`);
        // Default 3 seconds with cancellation check
        for (let i = 0; i < 30 && !previewCancelledRef.current; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return !previewCancelledRef.current;
    };
    
    try {
      // Play scenes starting from selected scene
      for (let i = selectedScene; i < scenes.length; i++) {
        const shouldContinue = await playScene(i);
        if (!shouldContinue) {
          console.log("🛑 Preview cancelled");
          return;
        }
      }
      
      console.log("🎬 Preview completed!");
    } catch (err) {
      console.error("❌ Preview error:", err);
    } finally {
      if (!previewCancelledRef.current) {
        setIsPlayingPreview(false);
        console.log("🛑 Preview stopped naturally");
      }
    }
  };

  const editScene = async (sceneIndex: number, newText: string) => {
    if (!id || !scenes[sceneIndex]) return;

    try {
      const res = await fetch("/api/edit_scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          scene_id: scenes[sceneIndex].id,
          scene_order: sceneIndex,
          text: newText
        }),
      });

      if (!res.ok) throw new Error("Failed to edit scene");

      // Update local state immediately
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], text: newText };
      setScenes(updatedScenes);

      // Mark scene as modified
      const newModified = new Set(modifiedScenes);
      newModified.add(sceneIndex);
      setModifiedScenes(newModified);

      setEditingScene(null);
      setEditText("");
    } catch (err) {
      console.error("Scene edit error:", err);
      alert(`Failed to edit scene: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const updateSceneEffect = async (sceneIndex: number, effectId: EffectType) => {
    if (!scenes[sceneIndex]?.id) return;

    try {
      const res = await fetch("/api/update_scene_effect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_id: scenes[sceneIndex].id,
          effect_id: effectId,
        }),
      });

      if (!res.ok) throw new Error("Failed to update effect");

      // Update local state immediately
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        effects: { motion: effectId }
      };
      setScenes(updatedScenes);

      console.log(`✅ Effect updated for scene ${sceneIndex + 1}: ${effectId}`);
    } catch (err) {
      console.error("Effect update error:", err);
      alert(`Failed to update effect: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const saveStoryTitle = async () => {
    if (!id || !editTitleText.trim()) return;

    setSavingTitle(true);

    try {
      const res = await fetch("/api/update_story_title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          title: editTitleText.trim()
        }),
      });

      if (!res.ok) throw new Error("Failed to update story title");

      // Update local state immediately
      setStory({ ...story, title: editTitleText.trim() });
      setEditingTitle(false);
      setEditTitleText("");
    } catch (err) {
      console.error("Title edit error:", err);
      alert(`Failed to update title: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSavingTitle(false);
    }
  };

  const startEditingTitle = () => {
    setEditTitleText(story?.title || "");
    setEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setEditingTitle(false);
    setEditTitleText("");
  };

  const handleDeleteClick = (sceneIndex: number) => {
    setSceneToDelete(sceneIndex);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (sceneToDelete === null || !id || !scenes[sceneToDelete]) return;
    
    try {
      const res = await fetch("/api/delete_scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          story_id: id, 
          scene_id: scenes[sceneToDelete].id,
          scene_order: sceneToDelete
        }),
      });
      
      if (!res.ok) throw new Error("Failed to delete scene");
      
      // Update local state immediately
      const updatedScenes = scenes.filter((_, index) => index !== sceneToDelete);
      setScenes(updatedScenes);
      
      // Update selected scene if necessary
      if (selectedScene >= sceneToDelete && selectedScene > 0) {
        setSelectedScene(selectedScene - 1);
      }
      
      // Update modified scenes set
      const newModified = new Set<number>();
      modifiedScenes.forEach(index => {
        if (index < sceneToDelete) {
          newModified.add(index);
        } else if (index > sceneToDelete) {
          newModified.add(index - 1);
        }
      });
      setModifiedScenes(newModified);
      
      // Close dialog and reset state
      setDeleteDialogOpen(false);
      setSceneToDelete(null);
      
    } catch (err) {
      console.error("Scene delete error:", err);
      alert(`Failed to delete scene: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDeleteDialogOpen(false);
      setSceneToDelete(null);
    }
  };

  const handleAddScene = async () => {
    if (!newSceneText.trim() || addScenePosition === null || !id) return;

    setAddingScene(true);
    try {
      const res = await fetch("/api/add_scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: id,
          scene_text: newSceneText.trim(),
          position: addScenePosition // 0 = before first scene, 1 = after first scene, etc.
        }),
      });

      if (!res.ok) throw new Error("Failed to add scene");

      const result = await res.json();

      // Update local state with the updated scenes (includes cache-busting for existing media)
      if (result.updated_scenes) {
        const timestamp = Date.now();
        const scenesWithTimestamp = result.updated_scenes.map((scene: any) => ({
          ...scene,
          image_url: scene.image_url ? `${scene.image_url}?t=${timestamp}` : scene.image_url,
          audio_url: scene.audio_url ? `${scene.audio_url}?t=${timestamp}` : scene.audio_url
        }));
        setScenes(scenesWithTimestamp);
      }

      // Close dialog and reset state
      setAddSceneDialogOpen(false);
      setNewSceneText("");
      setAddScenePosition(null);

    } catch (err) {
      console.error("Add scene error:", err);
      alert(`Failed to add scene: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAddingScene(false);
    }
  };

  const startEditing = (sceneIndex: number) => {
    setEditingScene(sceneIndex);
    setEditText(scenes[sceneIndex]?.text || "");
  };

  const cancelEditing = () => {
    setEditingScene(null);
    setEditText("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-purple-600 mx-auto mb-4" />
          <p className="text-lg text-gray-700 font-medium">Loading your magical story...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Top Header - Dark theme like StoryShort */}
      <header className="bg-black border-b border-gray-800">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to videos
            </Button>
            {editingTitle ? (
              <div className="flex items-center gap-2 flex-1 max-w-2xl">
                <input
                  type="text"
                  value={editTitleText}
                  onChange={(e) => setEditTitleText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveStoryTitle();
                    if (e.key === 'Escape') cancelEditingTitle();
                  }}
                  className="flex-1 text-lg font-semibold text-white bg-gray-800 border border-gray-700 rounded px-3 py-1.5 focus:outline-none focus:border-orange-500 min-w-[300px]"
                  autoFocus
                  disabled={savingTitle}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={saveStoryTitle}
                  disabled={savingTitle || !editTitleText.trim()}
                  className="text-green-400 hover:text-green-300 hover:bg-gray-800 flex-shrink-0"
                >
                  {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelEditingTitle}
                  disabled={savingTitle}
                  className="text-red-400 hover:text-red-300 hover:bg-gray-800 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-white">
                  {story?.title || "Video Editor"}
                </h1>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={startEditingTitle}
                  className="text-gray-400 hover:text-white hover:bg-gray-800"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Story Default Voice Selector */}
            <Popover open={storyVoicePopoverOpen} onOpenChange={setStoryVoicePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white"
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  {voices.find(v => v.id === (story?.voice_id || "21m00Tcm4TlvDq8ikWAM"))?.name || "Select Voice"}
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0 bg-gray-900 border-gray-700" align="start">
                <div className="p-2">
                  <div className="px-2 py-1.5 text-xs font-medium text-gray-400 mb-1">
                    Story Default Voice
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {loadingVoices ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                      </div>
                    ) : voices.length > 0 ? (
                      voices.map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => openVoiceUpdateConfirm(voice.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                            (story?.voice_id || "21m00Tcm4TlvDq8ikWAM") === voice.id
                              ? "bg-purple-900/30 text-white"
                              : "text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          <span>{voice.name}</span>
                          {(story?.voice_id || "21m00Tcm4TlvDq8ikWAM") === voice.id && (
                            <Check className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">No voices available</div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Voice Update Confirmation Dialog */}
            <AlertDialog open={voiceUpdateConfirmOpen} onOpenChange={setVoiceUpdateConfirmOpen}>
              <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Update Story Default Voice?</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    Change story default voice to <span className="font-semibold text-purple-400">{pendingVoiceName}</span>?
                    <br /><br />
                    All new scenes will use this voice by default. Existing scenes will keep their current voice unless regenerated.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={updateStoryVoice}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Update Voice
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Aspect Ratio Selector */}
            <Popover open={aspectRatioPopoverOpen} onOpenChange={setAspectRatioPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white"
                >
                  <Maximize className="w-4 h-4 mr-2" />
                  {aspectRatio === "9:16" && "9:16"}
                  {aspectRatio === "16:9" && "16:9"}
                  {aspectRatio === "1:1" && "1:1"}
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0 bg-gray-900 border-gray-700" align="start">
                <div className="p-2">
                  <div className="px-2 py-1.5 text-xs font-medium text-gray-400 mb-1">
                    Aspect Ratio
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        setAspectRatio("9:16");
                        setAspectRatioPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                        aspectRatio === "9:16"
                          ? "bg-purple-900/30 text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>9:16 (Portrait)</span>
                      {aspectRatio === "9:16" && (
                        <Check className="w-4 h-4 text-purple-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setAspectRatio("16:9");
                        setAspectRatioPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                        aspectRatio === "16:9"
                          ? "bg-purple-900/30 text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>16:9 (Landscape)</span>
                      {aspectRatio === "16:9" && (
                        <Check className="w-4 h-4 text-purple-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setAspectRatio("1:1");
                        setAspectRatioPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                        aspectRatio === "1:1"
                          ? "bg-purple-900/30 text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>1:1 (Square)</span>
                      {aspectRatio === "1:1" && (
                        <Check className="w-4 h-4 text-purple-400" />
                      )}
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Export Button */}
            <Button
              onClick={generateVideo}
              disabled={generatingVideo}
              className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6"
            >
              {generatingVideo ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export / Share
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tool Icons - Narrow */}
        <aside className="w-16 bg-black border-r border-gray-800 flex flex-col items-center py-6 gap-6">
          {/* Scenes/Frames Icon */}
          <button
            onClick={() => setLeftPanelView("scenes")}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "scenes" ? "text-purple-400 bg-purple-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Scenes"
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-[10px] mt-1">Scenes</span>
          </button>

          {/* Captions Icon */}
          <button
            onClick={() => setLeftPanelView("captions")}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "captions" ? "text-purple-400 bg-purple-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Captions"
          >
            <Type className="w-5 h-5" />
            <span className="text-[10px] mt-1">Captions</span>
          </button>

          {/* Background Music Icon */}
          <button
            onClick={() => setLeftPanelView("background_music")}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "background_music" ? "text-purple-400 bg-purple-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Background Music"
          >
            <Music className="w-5 h-5" />
            <span className="text-[10px] mt-1">Music</span>
            {bgMusicEnabled && bgMusicUrl && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500"></div>
            )}
          </button>
        </aside>

        {/* Main Content - Side by Side Layout: 40% Timeline + 60% Preview */}
        <main className="flex-1 flex bg-black overflow-hidden">
          {/* Left Timeline Section - 40% width */}
          <div className="w-[40%] border-r border-gray-800 bg-black overflow-y-auto">
            {leftPanelView === "scenes" ? (
              /* Scenes Timeline View */
              <TooltipProvider delayDuration={300}>
                <div className="p-4 space-y-3">
                  {scenes.map((scene, index) => (
                <div key={`scene-wrapper-${scene.id}`}>
                  {/* Add Scene Button - appears before each scene */}
                  <div className="flex justify-center my-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            setAddScenePosition(index);
                            setAddSceneDialogOpen(true);
                          }}
                          className="flex items-center justify-center w-7 h-7 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full transition-colors border border-gray-700 hover:border-gray-600"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Add a new scene at this position</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Scene Tile */}
                <div
                  key={`${scene.id}-${scene.image_url}`}
                  onClick={() => {
                    stopVideoPreview();
                    setSelectedScene(index);
                  }}
                  className={`bg-gray-900 rounded-lg border-2 transition-all cursor-pointer ${
                    index === selectedScene
                      ? 'border-orange-500 shadow-lg shadow-orange-500/20'
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="p-3 flex flex-col">
                    {/* Thumbnail and Scene Number */}
                    <div className="flex gap-3 mb-3">
                      {/* Thumbnail */}
                      <div className="relative w-20 h-32 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                        {scene.image_url ? (
                          <img
                            key={scene.image_url}
                            src={scene.image_url}
                            alt={`Scene ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-gray-600" />
                          </div>
                        )}
                        {/* Scene number badge */}
                        <div className="absolute top-1 left-1 bg-black/80 px-2 py-0.5 rounded text-white text-xs font-bold">
                          #{index}
                        </div>
                        {/* Audio indicator - clickable to play/pause */}
                        {scene.audio_url && (
                          <button
                            onClick={(e) => toggleThumbnailAudio(index, scene.audio_url!, e)}
                            className="absolute bottom-1 right-1 bg-green-500 hover:bg-green-600 p-1 rounded transition-colors cursor-pointer"
                          >
                            {playingThumbnailAudio === index ? (
                              <Pause className="w-3 h-3 text-white" />
                            ) : (
                              <Volume2 className="w-3 h-3 text-white" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Scene Info */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-orange-500 text-xs font-medium flex items-center gap-1">
                            <span>🎤</span> Voice caption
                          </div>
                          {/* Modified indicator - show when scene was edited and has existing media */}
                          {modifiedScenes.has(index) && (scene.image_url || scene.audio_url) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="px-2 py-0.5 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-400 text-[10px] font-medium">
                                  Modified
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{getRegenerationMessage(scene)}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {/* Inline editing or text display */}
                        {editingScene === index ? (
                          <div className="flex flex-col gap-2 mb-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                              rows={4}
                              autoFocus
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  editScene(index, editText);
                                }}
                                disabled={!editText.trim() || editText === scene.text}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Check className="w-3 h-3" />
                                Save
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingScene(null);
                                  setEditText("");
                                }}
                                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-400 text-xs line-clamp-4 mb-2">
                            {scene.text}
                          </div>
                        )}
                        <div className="text-gray-500 text-xs mt-auto flex items-center gap-1">
                          <span>⏱️</span> {scene.duration ? `${Math.round(scene.duration)}s` : '--'}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-800">
                      <div className="flex gap-2">
                        {/* Audio Button or Status */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {scene.audio_url ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAudioDrawer(index);
                                }}
                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                                  isAudioOutdated(scene)
                                    ? 'bg-yellow-900/50 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-400'
                                    : 'bg-green-800 hover:bg-green-700 text-white'
                                }`}
                              >
                                <Check className="w-3 h-3" />
                                Audio
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAudioDrawer(index);
                                }}
                                disabled={generatingSceneAudio.has(index)}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {generatingSceneAudio.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Audio...
                                  </>
                                ) : (
                                  <>
                                    <X className="w-3 h-3" />
                                    Audio
                                  </>
                                )}
                              </button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getAudioButtonTooltip(scene)}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Image Button or Status */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {scene.image_url ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImageDrawer(index);
                                }}
                                disabled={generatingSceneImage.has(index)}
                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                                  isImageOutdated(scene)
                                    ? 'bg-yellow-900/50 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-400'
                                    : 'bg-green-800 hover:bg-green-700 text-white'
                                }`}
                              >
                                {generatingSceneImage.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Regen...
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3 h-3" />
                                    Image
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImageDrawer(index);
                                }}
                                disabled={generatingSceneImage.has(index)}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {generatingSceneImage.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Image...
                                  </>
                                ) : (
                                  <>
                                    <X className="w-3 h-3" />
                                    Image
                                  </>
                                )}
                              </button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getImageButtonTooltip(scene)}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Effect Button */}
                        {scene.image_url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEffectScene(index);
                                  setEffectModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded transition-colors flex items-center gap-1.5"
                              >
                                <Sparkles className="w-3 h-3" />
                                Effect
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Add video effect ({scene.effects?.motion || 'none'})</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingScene(index);
                            setEditText(scene.text);
                          }}
                          className="p-2 bg-gray-800 hover:bg-blue-600 text-gray-400 hover:text-white rounded transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSceneToDelete(index);
                            setDeleteDialogOpen(true);
                          }}
                          className="p-2 bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              ))}

              {/* Add Scene Button - appears after all scenes */}
              <div className="flex justify-center my-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        setAddScenePosition(scenes.length);
                        setAddSceneDialogOpen(true);
                      }}
                      className="flex items-center justify-center w-7 h-7 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full transition-colors border border-gray-700 hover:border-gray-600"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add a new scene at the end</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Generate Images Button */}
              <div className="bg-gray-900 rounded-lg border-2 border-dashed border-gray-700 hover:border-gray-600 transition-all">
                <div className="p-4 flex flex-col items-center justify-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setBulkImageDrawerOpen(true)}
                        disabled={generatingImages}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {generatingImages ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating All...
                          </>
                        ) : (
                          <>
                            <Image className="w-4 h-4 mr-2" />
                            Generate All Images
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Generate images for all scenes at once using AI</p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="text-xs text-gray-400 text-center">
                    {scenes.filter(s => s.image_url).length} / {scenes.length} scenes with images
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    Tip: Click "Image" on each scene to generate individually
                  </div>
                </div>
              </div>

              {/* Generate All Audio Button */}
              <div className="bg-gray-900 rounded-lg border-2 border-dashed border-gray-700 hover:border-gray-600 transition-all">
                <div className="p-4 flex flex-col items-center justify-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setBulkAudioDrawerOpen(true)}
                        disabled={generatingAudios}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {generatingAudios ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating All...
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4 mr-2" />
                            Generate All Audio
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Generate audio narration for all scenes at once</p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="text-xs text-gray-400 text-center">
                    {scenes.filter(s => s.audio_url).length} / {scenes.length} scenes with audio
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    Tip: Click "Audio" on each scene to generate individually
                  </div>
                </div>
              </div>
            </div>
          </TooltipProvider>
            ) : leftPanelView === "captions" ? (
              /* Captions Settings View */
              <div className="p-6 space-y-6">
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
                        captionsEnabled ? "bg-purple-600" : "bg-gray-700"
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
                        Position from Bottom: <span className="text-purple-400 font-bold">{captionPositionFromBottom}%</span>
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
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-purple-500"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: 'right 0.5rem center',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '1.5em 1.5em',
                          paddingRight: '2.5rem',
                        }}
                      >
                        <optgroup label="Sans-Serif (Modern)" className="bg-gray-900 text-gray-400">
                          <option value="Montserrat">Montserrat</option>
                          <option value="Poppins">Poppins</option>
                          <option value="Inter">Inter</option>
                          <option value="Roboto">Roboto</option>
                          <option value="Open Sans">Open Sans</option>
                          <option value="Lato">Lato</option>
                          <option value="Raleway">Raleway</option>
                          <option value="Nunito">Nunito</option>
                          <option value="Source Sans Pro">Source Sans Pro</option>
                          <option value="Oswald">Oswald</option>
                          <option value="Bebas Neue">Bebas Neue</option>
                          <option value="Arial">Arial</option>
                          <option value="Helvetica">Helvetica</option>
                          <option value="Verdana">Verdana</option>
                        </optgroup>
                        <optgroup label="Serif (Classic)" className="bg-gray-900 text-gray-400">
                          <option value="Playfair Display">Playfair Display</option>
                          <option value="Merriweather">Merriweather</option>
                          <option value="Lora">Lora</option>
                          <option value="PT Serif">PT Serif</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Georgia">Georgia</option>
                        </optgroup>
                        <optgroup label="Display & Handwriting" className="bg-gray-900 text-gray-400">
                          <option value="Bangers">Bangers</option>
                          <option value="Pacifico">Pacifico</option>
                          <option value="Righteous">Righteous</option>
                          <option value="Lobster">Lobster</option>
                          <option value="Permanent Marker">Permanent Marker</option>
                          <option value="Dancing Script">Dancing Script</option>
                        </optgroup>
                        <optgroup label="Monospace" className="bg-gray-900 text-gray-400">
                          <option value="Courier New">Courier New</option>
                          <option value="Roboto Mono">Roboto Mono</option>
                          <option value="Source Code Pro">Source Code Pro</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Font Size */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        Font Size: <span className="text-purple-400 font-bold">{captionFontSize}px</span>
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
                        Font Weight: <span className="text-purple-400 font-bold">{captionFontWeight}</span>
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
                          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-300 text-sm focus:outline-none focus:border-purple-500"
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
                          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-300 text-sm focus:outline-none focus:border-purple-500"
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
                        Words Per Batch: <span className="text-purple-400 font-bold">{captionWordsPerBatch} {captionWordsPerBatch === 1 ? 'word' : 'words'}</span>
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
            ) : (
              /* Background Music Settings View */
              <div className="p-6 space-y-6">
                <h2 className="text-xl font-semibold text-white mb-4">Background Music</h2>

                {/* Enable/Disable Background Music */}
                <div className="p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-white">Enable Background Music</h3>
                      <p className="text-xs text-gray-400 mt-1">Add background music to your video</p>
                    </div>
                    <button
                      onClick={() => setBgMusicEnabled(!bgMusicEnabled)}
                      disabled={!bgMusicUrl}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        bgMusicEnabled ? "bg-purple-600" : "bg-gray-700"
                      } ${!bgMusicUrl ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          bgMusicEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Selected Music */}
                {bgMusicUrl && (
                  <div className="p-4 bg-gray-800 rounded-lg">
                    <h3 className="text-sm font-medium text-white mb-3">Selected Music</h3>
                    <div className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg">
                      <Music className="w-5 h-5 text-purple-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{bgMusicName || "Background music"}</p>
                        <p className="text-xs text-gray-400">Click play to preview</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={toggleBgMusicPlayback}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {bgMusicPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Music Library Browser */}
                <div className="p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white">Music Library</h3>
                    <label className="block">
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleBgMusicUpload(file);
                        }}
                        className="hidden"
                        disabled={bgMusicUploading}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-purple-600 hover:bg-purple-700 text-white border-none"
                        disabled={bgMusicUploading}
                      >
                        {bgMusicUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload New
                          </>
                        )}
                      </Button>
                    </label>
                  </div>

                  {/* Category Filter */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {["upbeat", "calm", "cinematic", "dramatic", "ambient", "other"].map((category) => (
                      <button
                        key={category}
                        onClick={() => {
                          const newCategory = selectedCategory === category ? null : category;
                          setSelectedCategory(newCategory);
                          fetchMusicLibrary(newCategory || undefined);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedCategory === category
                            ? "bg-purple-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Music List */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {musicLibraryLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                      </div>
                    ) : musicLibrary.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">
                        No music tracks available. Upload your first track!
                      </p>
                    ) : (
                      musicLibrary.map((music) => (
                        <div
                          key={music.id}
                          onClick={() => music.file_url && handleSelectMusicFromLibrary(music)}
                          className={`p-3 rounded-lg cursor-pointer transition-colors ${
                            bgMusicId === music.id
                              ? "bg-purple-900/40 border border-purple-500"
                              : music.file_url
                              ? "bg-gray-900 hover:bg-gray-800"
                              : "bg-gray-900/50 opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Music className={`w-4 h-4 ${bgMusicId === music.id ? "text-purple-400" : "text-gray-500"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate font-medium">{music.name}</p>
                              {music.description && (
                                <p className="text-xs text-gray-400 truncate">{music.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                {music.is_preset && (
                                  <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded">Preset</span>
                                )}
                                {music.category && (
                                  <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{music.category}</span>
                                )}
                                {!music.file_url && (
                                  <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded">No file</span>
                                )}
                              </div>
                            </div>
                            {bgMusicId === music.id && (
                              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Volume Control */}
                {bgMusicUrl && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Volume: <span className="text-purple-400 font-bold">{bgMusicVolume}%</span>
                    </label>
                    <p className="text-xs text-gray-400 mb-3">
                      Adjust background music volume relative to narration
                    </p>
                    <Slider
                      value={[bgMusicVolume]}
                      onValueChange={(value) => setBgMusicVolume(value[0])}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Preview Section - 60% width */}
          <div className="w-[60%] flex items-center justify-center p-8 bg-black">
            <div className="video-preview-container">
              {scenes[selectedScene]?.image_url ? (
                <div className="relative">
                  {/* Main Preview Container */}
                  <div
                    className="rounded-lg shadow-2xl overflow-hidden bg-black relative"
                    style={{
                      width: `${getPreviewDimensions().width}px`,
                      height: `${getPreviewDimensions().height}px`
                    }}
                  >
                    <img
                      src={scenes[selectedScene].image_url}
                      alt="Scene preview"
                      className={`w-full h-full object-cover ${getEffectAnimationClass(scenes[selectedScene]?.effects?.motion || "none")}`}
                      style={{
                        transformOrigin: "center center",
                        animationDuration: `${scenes[selectedScene]?.duration || 5}s`
                      }}
                      loading="eager"
                      decoding="async"
                    />

                    {/* Caption Overlay */}
                    {captionsEnabled && scenes[selectedScene]?.text && (() => {
                      const baseStyle: React.CSSProperties = {
                        fontFamily: captionFontFamily,
                        fontSize: `${captionFontSize}px`,
                        fontWeight: captionFontWeight,
                        color: captionInactiveColor,
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                        lineHeight: '1.4',
                      };

                      return (
                        <div
                          className="absolute left-0 right-0 px-8 pointer-events-none flex items-center justify-center"
                          style={{ bottom: `${captionPositionFromBottom}%` }}
                        >
                          <div className="max-w-full text-center">
                            {scenes[selectedScene].word_timestamps && scenes[selectedScene].word_timestamps!.length > 0 ? (
                              <WordByWordCaption
                                wordTimestamps={scenes[selectedScene].word_timestamps!}
                                currentTime={currentTime}
                                style={baseStyle}
                                highlightColor={captionActiveColor}
                                inactiveColor={captionInactiveColor}
                                dimmedOpacity={0.6}
                                wordsPerBatch={captionWordsPerBatch}
                                textTransform={captionTextTransform}
                              />
                            ) : (
                              <SimpleCaption text={scenes[selectedScene].text} style={baseStyle} />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Video Controls Overlay */}
                    <div className="absolute inset-0 opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pb-3 pt-16">
                        {/* Progress Bar */}
                        {getTotalDuration() > 0 && (
                          <div className="px-3 pb-2 group/seek">
                            <Slider
                              value={[totalProgress]}
                              max={getTotalDuration()}
                              step={0.1}
                              disabled={isSeeking}
                              onValueChange={(value) => {
                                seekToTotalTime(value[0]);
                              }}
                              className="[&_[role=slider]]:opacity-0 group-hover/seek:[&_[role=slider]]:opacity-100"
                            />
                          </div>
                        )}

                        {/* Control Bar */}
                        <div className="flex items-center justify-between px-3">
                          <div className="flex items-center gap-1">
                            {/* Play/Pause */}
                            <button
                              onClick={isPlayingPreview ? stopVideoPreview : startVideoPreview}
                              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 text-white rounded"
                            >
                              {isPlayingPreview ? (
                                <Pause className="w-6 h-6 fill-current" />
                              ) : (
                                <Play className="w-6 h-6 fill-current" />
                              )}
                            </button>

                            {/* Volume Group - Shows slider on hover */}
                            <div className="flex items-center gap-1 group/volume">
                              <button
                                onClick={() => {
                                  if (volume === 0) {
                                    setVolume(lastVolume);
                                  } else {
                                    setLastVolume(volume);
                                    setVolume(0);
                                  }
                                }}
                                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 text-white rounded"
                              >
                                {volume === 0 ? (
                                  <VolumeX className="w-6 h-6" />
                                ) : (
                                  <Volume2 className="w-6 h-6" />
                                )}
                              </button>

                              <div className="overflow-hidden transition-all duration-200 w-0 group-hover/volume:w-16">
                                <Slider
                                  value={[volume]}
                                  max={1}
                                  step={0.01}
                                  onValueChange={(value) => {
                                    setVolume(value[0]);
                                    if (value[0] > 0) setLastVolume(value[0]);
                                  }}
                                />
                              </div>
                            </div>

                            {/* Time */}
                            {getTotalDuration() > 0 && (
                              <div className="text-white text-sm font-medium ml-2 tabular-nums">
                                {Math.floor(totalProgress / 60)}:{String(Math.floor(totalProgress % 60)).padStart(2, '0')} / {Math.floor(getTotalDuration() / 60)}:{String(Math.floor(getTotalDuration() % 60)).padStart(2, '0')}
                              </div>
                            )}
                          </div>

                          {/* Fullscreen */}
                          <button
                            onClick={() => {
                              const element = document.querySelector('.video-preview-container');
                              if (element) {
                                if (document.fullscreenElement) {
                                  document.exitFullscreen();
                                } else {
                                  element.requestFullscreen();
                                }
                              }
                            }}
                            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 text-white rounded"
                          >
                            <Maximize className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-lg bg-gray-900 border border-gray-800 flex flex-col items-center justify-center text-gray-400"
                  style={{
                    width: `${getPreviewDimensions().width}px`,
                    height: `${getPreviewDimensions().height}px`
                  }}
                >
                  <ImageIcon className="w-16 h-16 mb-4 text-gray-600" />
                  <h3 className="text-lg font-medium mb-2">No Image Generated</h3>
                  <p className="text-sm text-gray-500">Generate images to see preview</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && sceneToDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setDeleteDialogOpen(false);
              setSceneToDelete(null);
            }}
          />

          {/* Dialog Content */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Delete Scene?</h3>
                  <p className="text-sm text-gray-400">Scene {sceneToDelete + 1} of {scenes.length}</p>
                </div>
              </div>

              {/* Warning Message */}
              <p className="text-gray-300 mb-4">
                Are you sure you want to delete this scene? <span className="font-semibold text-red-400">This action cannot be undone.</span>
              </p>

              {/* Scene Preview */}
              <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex gap-3">
                  {/* Scene Image Preview */}
                  {scenes[sceneToDelete]?.image_url ? (
                    <div className="flex-shrink-0">
                      <img
                        key={scenes[sceneToDelete].image_url}
                        src={scenes[sceneToDelete].image_url}
                        alt={`Scene ${sceneToDelete + 1}`}
                        className="w-20 h-32 object-cover rounded border border-gray-600"
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-20 h-32 bg-gray-700 rounded border border-gray-600 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-gray-500" />
                    </div>
                  )}

                  {/* Scene Description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400 mb-2">Scene Description</div>
                    <p className="text-sm text-gray-300 line-clamp-4 leading-relaxed">
                      {scenes[sceneToDelete]?.text}
                    </p>
                  </div>
                </div>
              </div>

              {/* What Will Be Deleted */}
              <div className="mb-6 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                <p className="text-xs text-red-300 font-semibold mb-2">This will permanently delete:</p>
                <ul className="text-xs text-red-200 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                    Scene text and description
                  </li>
                  {scenes[sceneToDelete]?.image_url && (
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                      Image file
                    </li>
                  )}
                  {scenes[sceneToDelete]?.audio_url && (
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                      Audio file
                    </li>
                  )}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setSceneToDelete(null);
                  }}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Scene
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Scene Dialog */}
      {addSceneDialogOpen && addScenePosition !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setAddSceneDialogOpen(false);
              setNewSceneText("");
              setAddScenePosition(null);
            }}
          />

          {/* Dialog Content */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-orange-900/30 rounded-full flex items-center justify-center">
                  <Plus className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Add New Scene</h3>
                  <p className="text-sm text-gray-400">
                    {addScenePosition === 0
                      ? "Insert before scene 1"
                      : addScenePosition === scenes.length
                      ? `Add after scene ${scenes.length}`
                      : `Insert between scene ${addScenePosition} and ${addScenePosition + 1}`}
                  </p>
                </div>
              </div>

              {/* Scene Text Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Scene Description
                </label>
                <textarea
                  value={newSceneText}
                  onChange={(e) => setNewSceneText(e.target.value)}
                  placeholder="Describe what happens in this scene..."
                  className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>Enter a detailed description for this scene</span>
                  <span>{newSceneText.length} characters</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddSceneDialogOpen(false);
                    setNewSceneText("");
                    setAddScenePosition(null);
                  }}
                  disabled={addingScene}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddScene}
                  disabled={!newSceneText.trim() || addingScene}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingScene ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding Scene...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Scene
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audio Generation Drawer */}
      {audioDrawerOpen && audioDrawerScene !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              // Stop any playing voice preview
              if (voicePreviewAudioRef.current) {
                voicePreviewAudioRef.current.pause();
                voicePreviewAudioRef.current = null;
              }
              setPlayingPreviewId(null);
              setAudioDrawerOpen(false);
            }}
          />

          {/* Drawer Content */}
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all">
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {scenes[audioDrawerScene]?.audio_url ? 'Regenerate Audio' : 'Generate Audio'}
                </h3>
                <button
                  onClick={() => {
                    // Stop any playing voice preview
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);
                    setAudioDrawerOpen(false);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scene Info */}
              <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-400 mb-1">Scene #{audioDrawerScene}</div>
                <div className="text-sm text-gray-300 line-clamp-2">
                  {scenes[audioDrawerScene]?.text}
                </div>
              </div>

              {/* Voice Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Select Voice
                  </label>
                  {audioDrawerScene !== null && !scenes[audioDrawerScene]?.voice_id && (
                    <span className="text-xs text-gray-500">Using story default</span>
                  )}
                </div>
                {loadingVoices ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="ml-2 text-sm text-gray-400">Loading voices...</span>
                  </div>
                ) : (
                  <div ref={voiceListRef} className="max-h-[300px] overflow-y-auto border border-gray-700 rounded-lg bg-gray-800">
                    {voices.map((voice) => (
                      <div
                        key={voice.id}
                        data-voice-id={voice.id}
                        onClick={() => setSelectedVoiceId(voice.id)}
                        className={`flex items-center justify-between p-3 cursor-pointer transition-colors border-b border-gray-700 last:border-b-0 ${
                          selectedVoiceId === voice.id
                            ? 'bg-purple-900/30 border-l-4 border-l-purple-500'
                            : 'hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {selectedVoiceId === voice.id && (
                            <Check className="w-4 h-4 text-purple-400" />
                          )}
                          <span className="text-sm text-white">{voice.name}</span>
                        </div>
                        {voice.preview_url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playVoicePreview(voice.id, voice.preview_url);
                            }}
                            className={`p-1.5 rounded-full transition-colors ${
                              playingPreviewId === voice.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                            title="Preview voice"
                          >
                            {playingPreviewId === voice.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <PlayCircle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {scenes[audioDrawerScene]?.audio_url && (
                  <p className="mt-2 text-xs text-gray-400">
                    Current voice will be replaced with your selection
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Stop any playing voice preview
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);
                    setAudioDrawerOpen(false);
                  }}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    // Stop any playing voice preview before generating
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);
                    await generateSceneAudio(audioDrawerScene, selectedVoiceId);
                    setAudioDrawerOpen(false);
                  }}
                  disabled={generatingSceneAudio.has(audioDrawerScene)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {generatingSceneAudio.has(audioDrawerScene) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 mr-2" />
                      Generate Audio
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Generation Drawer */}
      {imageDrawerOpen && imageDrawerScene !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setImageDrawerOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Generate Image</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Scene {imageDrawerScene + 1} of {scenes.length}
                  </p>
                </div>
                <button
                  onClick={() => setImageDrawerOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scene Preview */}
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <div className="flex gap-4">
                  {/* Current Image Preview (if exists) */}
                  {scenes[imageDrawerScene]?.image_url && (
                    <div className="flex-shrink-0">
                      <div className="text-xs text-gray-400 mb-2">Current Image</div>
                      <img
                        src={scenes[imageDrawerScene].image_url}
                        alt="Current scene"
                        className="w-24 h-40 object-cover rounded border border-gray-700"
                      />
                    </div>
                  )}

                  {/* Scene Text */}
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-2">Scene Description</div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {scenes[imageDrawerScene]?.text}
                    </p>
                  </div>
                </div>
              </div>

              {/* Visual Consistency Info */}
              {imageDrawerScene !== null && scenes.filter(s => s.image_url && scenes.indexOf(s) !== imageDrawerScene).length > 0 && (
                <div className="mb-6 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Image className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-300">
                      <span className="font-semibold">Visual Consistency:</span> This image will be generated using AI to match the style and characters from your existing {scenes.filter(s => s.image_url && scenes.indexOf(s) !== imageDrawerScene).length} scene image(s).
                    </div>
                  </div>
                </div>
              )}

              {/* Optional Instructions */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Additional Instructions (Optional)
                </label>
                <textarea
                  value={imageInstructions}
                  onChange={(e) => setImageInstructions(e.target.value)}
                  placeholder="Add specific details or requirements for this image..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Example: "Show the character from behind", "Include a sunset in the background"
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setImageDrawerOpen(false)}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (imageDrawerScene !== null) {
                      await generateSceneImage(
                        imageDrawerScene,
                        undefined, // Don't pass style - will use existing scenes for consistency
                        imageInstructions
                      );
                    }
                  }}
                  disabled={imageDrawerScene !== null && generatingSceneImage.has(imageDrawerScene)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {imageDrawerScene !== null && generatingSceneImage.has(imageDrawerScene) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Image className="w-4 h-4 mr-2" />
                      Generate Image
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Image Generation Drawer */}
      {bulkImageDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBulkImageDrawerOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Generate All Images</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Generate images for all {scenes.length} scenes in this story
                  </p>
                </div>
                <button
                  onClick={() => setBulkImageDrawerOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Load Sample Images Button */}
              <div className="mb-4">
                <Button
                  onClick={loadSampleImages}
                  disabled={loadingSampleImages}
                  size="sm"
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white"
                >
                  {loadingSampleImages ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading Sample Images...
                    </>
                  ) : sampleImagesLoaded ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Sample Images Loaded
                    </>
                  ) : (
                    <>
                      <Image className="w-4 h-4 mr-2" />
                      Load Sample Images for Style Reference
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Generate example images for each style to see how they look
                </p>
              </div>

              {/* Info Cards */}
              {scenes.filter(s => s.image_url).length > 0 && (
                <div className="mb-4 p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Image className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-orange-300">
                      <span className="font-semibold">Note:</span> This will regenerate ALL scene images, including existing ones.
                    </div>
                  </div>
                </div>
              )}

              {/* Style Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Select Image Style
                </label>

                <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-800">
                  {[
                    { id: "hyper-realistic", value: "hyper realistic photo, 4k, ultra detailed", label: "Hyper Realistic", visual: "📸" },
                    { id: "cinematic", value: "cinematic movie still, dramatic lighting, film grain", label: "Cinematic", visual: "🎬" },
                    { id: "black-and-white", value: "black and white photography, film noir, high contrast", label: "Black & White", visual: "🎞️" },
                    { id: "anime", value: "anime illustration, high quality", label: "Anime", visual: "🎌" },
                    { id: "3d-animation", value: "3d pixar style animation, rendered", label: "3D Animation", visual: "🎭" },
                    { id: "cartoon", value: "cartoon illustration, bold outlines", label: "Cartoon", visual: "🎪" },
                    { id: "oil-painting", value: "oil painting, brushstrokes, classical art", label: "Oil Painting", visual: "🖼️" },
                    { id: "watercolor", value: "watercolor painting, soft, artistic", label: "Watercolor", visual: "🎨" },
                    { id: "pencil-sketch", value: "pencil sketch drawing, detailed shading", label: "Pencil Sketch", visual: "✏️" },
                    { id: "comic-book", value: "comic book art style, bold lines, vibrant colors", label: "Comic Book", visual: "💥" },
                    { id: "pixel-art", value: "pixel art, retro 16-bit game style", label: "Pixel Art", visual: "🎮" },
                    { id: "vaporwave", value: "vaporwave aesthetic, neon colors, retrowave, cyberpunk", label: "Vaporwave", visual: "🌃" }
                  ].map((style) => {
                    const sampleImageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/samples/sample-${style.id}.png`;
                    return (
                    <button
                      key={style.value}
                      onClick={() => setSelectedImageStyle(style.value)}
                      className={`flex-shrink-0 rounded-lg transition-all border-2 overflow-hidden ${
                        selectedImageStyle === style.value
                          ? "border-blue-500 shadow-lg shadow-blue-500/20"
                          : "border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      {/* 9:16 Image Container */}
                      <div className="relative w-32 aspect-[9/16] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                        {/* Sample image */}
                        <img
                          src={sampleImageUrl}
                          alt={style.label}
                          className="absolute inset-0 w-full h-full object-cover"
                        />

                        {/* Selected checkmark - top right corner */}
                        {selectedImageStyle === style.value && (
                          <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1 shadow-lg z-20">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <div className={`p-2 text-center ${
                        selectedImageStyle === style.value
                          ? "bg-blue-900/40 text-white"
                          : "bg-gray-800 text-gray-300"
                      }`}>
                        <div className="text-xs font-medium">{style.label}</div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>

              {/* Optional Instructions */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Additional Instructions (Optional)
                </label>
                <textarea
                  value={imageInstructions}
                  onChange={(e) => setImageInstructions(e.target.value)}
                  placeholder="Add specific details or requirements..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setBulkImageDrawerOpen(false)}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await generateImages(selectedImageStyle, imageInstructions);
                  }}
                  disabled={generatingImages}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {generatingImages ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Image className="w-4 h-4 mr-2" />
                      Generate All Images
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Audio Generation Drawer */}
      {bulkAudioDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBulkAudioDrawerOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full my-auto max-h-[90vh] flex flex-col transform transition-all">
            {/* Header - Fixed */}
            <div className="p-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Generate All Audio</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Generate audio narration for all {scenes.length} scenes
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Stop any playing voice preview
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);
                    setBulkAudioDrawerOpen(false);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Voice Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Select Voice
                  </label>
                  <span className="text-xs text-gray-500">Will apply to all scenes</span>
                </div>
                {loadingVoices ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="ml-2 text-sm text-gray-400">Loading voices...</span>
                  </div>
                ) : (
                  <div ref={voiceListRef} className="max-h-[300px] overflow-y-auto border border-gray-700 rounded-lg bg-gray-800">
                    {voices.map((voice) => (
                      <div
                        key={voice.id}
                        data-voice-id={voice.id}
                        onClick={() => {
                          console.log(`🎤 Bulk Audio - Voice selected: ${voice.name} (${voice.id})`);
                          setSelectedVoiceId(voice.id);
                        }}
                        className={`flex items-center justify-between p-3 cursor-pointer transition-colors border-b border-gray-700 last:border-b-0 ${
                          selectedVoiceId === voice.id
                            ? 'bg-purple-900/30 border-l-4 border-l-purple-500'
                            : 'hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {selectedVoiceId === voice.id && (
                            <Check className="w-4 h-4 text-purple-400" />
                          )}
                          <span className="text-sm text-white">{voice.name}</span>
                        </div>
                        {voice.preview_url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playVoicePreview(voice.id, voice.preview_url);
                            }}
                            className={`p-1.5 rounded-full transition-colors ${
                              playingPreviewId === voice.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                            title="Preview voice"
                          >
                            {playingPreviewId === voice.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <PlayCircle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Warning about regeneration */}
              {scenes.filter(s => s.audio_url).length > 0 && (
                <div className="mb-6 p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Volume2 className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-orange-300">
                      <span className="font-semibold">Note:</span> This will regenerate ALL scene audio, including existing ones. Use individual scene generation if you only want to create missing audio.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fixed Footer with Action Buttons */}
            <div className="border-t border-gray-700 p-4 flex-shrink-0">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Stop any playing voice preview
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);
                    setBulkAudioDrawerOpen(false);
                  }}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    console.log("🔘 Generate All Audio button clicked");
                    console.log("  Current selectedVoiceId state:", selectedVoiceId);

                    // Stop any playing voice preview before generating
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);
                    await generateAllAudio(selectedVoiceId);
                  }}
                  disabled={generatingAudios}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {generatingAudios ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 mr-2" />
                      Generate All Audio
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Captions Settings Drawer */}
      {captionsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCaptionsDrawerOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Caption Settings</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Customize how captions appear in your video
                  </p>
                </div>
                <button
                  onClick={() => setCaptionsDrawerOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Enable/Disable Captions */}
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white">Enable Captions</h3>
                    <p className="text-xs text-gray-400 mt-1">Show text captions in exported video</p>
                  </div>
                  <button
                    onClick={() => setCaptionsEnabled(!captionsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      captionsEnabled ? "bg-purple-600" : "bg-gray-700"
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
                  {/* Font Family */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Family
                    </label>
                    <select
                      value={captionFontFamily}
                      onChange={(e) => setCaptionFontFamily(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-purple-500"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.5rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '2.5rem',
                      }}
                    >
                      <optgroup label="Sans-Serif (Modern)" className="bg-gray-900 text-gray-400">
                        <option value="Montserrat">Montserrat</option>
                        <option value="Poppins">Poppins</option>
                        <option value="Inter">Inter</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Open Sans">Open Sans</option>
                        <option value="Lato">Lato</option>
                        <option value="Raleway">Raleway</option>
                        <option value="Nunito">Nunito</option>
                        <option value="Source Sans Pro">Source Sans Pro</option>
                        <option value="Oswald">Oswald</option>
                        <option value="Bebas Neue">Bebas Neue</option>
                        <option value="Arial">Arial</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Verdana">Verdana</option>
                      </optgroup>
                      <optgroup label="Serif (Classic)" className="bg-gray-900 text-gray-400">
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Merriweather">Merriweather</option>
                        <option value="Lora">Lora</option>
                        <option value="PT Serif">PT Serif</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Georgia">Georgia</option>
                      </optgroup>
                      <optgroup label="Display & Handwriting" className="bg-gray-900 text-gray-400">
                        <option value="Bangers">Bangers</option>
                        <option value="Pacifico">Pacifico</option>
                        <option value="Righteous">Righteous</option>
                        <option value="Lobster">Lobster</option>
                        <option value="Permanent Marker">Permanent Marker</option>
                        <option value="Dancing Script">Dancing Script</option>
                      </optgroup>
                      <optgroup label="Monospace" className="bg-gray-900 text-gray-400">
                        <option value="Courier New">Courier New</option>
                        <option value="Roboto Mono">Roboto Mono</option>
                        <option value="Source Code Pro">Source Code Pro</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Caption Position from Bottom */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Position from Bottom: <span className="text-purple-400 font-bold">{captionPositionFromBottom}%</span>
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

                  {/* Font Size */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Size: <span className="text-purple-400 font-bold">{captionFontSize}px</span>
                    </label>
                    <input
                      type="range"
                      min="16"
                      max="32"
                      value={captionFontSize}
                      onChange={(e) => setCaptionFontSize(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Small (16px)</span>
                      <span>Large (32px)</span>
                    </div>
                  </div>

                  {/* Font Weight */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Weight: <span className="text-purple-400 font-bold">{captionFontWeight}</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="900"
                      step="100"
                      value={captionFontWeight}
                      onChange={(e) => setCaptionFontWeight(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Thin (100)</span>
                      <span>Bold (900)</span>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-8">
                <Button
                  variant="outline"
                  onClick={() => setCaptionsDrawerOpen(false)}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setCaptionsDrawerOpen(false);
                    // Settings are already saved in state
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Effect Selection Modal */}
      {selectedEffectScene !== null && (
        <EffectSelectionModal
          isOpen={effectModalOpen}
          onClose={() => {
            setEffectModalOpen(false);
            setSelectedEffectScene(null);
          }}
          currentEffect={(scenes[selectedEffectScene]?.effects?.motion as EffectType) || "none"}
          sceneImageUrl={scenes[selectedEffectScene]?.image_url || ""}
          onSelectEffect={(effectId) => {
            updateSceneEffect(selectedEffectScene, effectId);
          }}
        />
      )}
    </div>
  );
}
