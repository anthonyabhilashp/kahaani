import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { Button } from "../../components/ui/button";
import { ProductTour } from "../../components/ProductTour";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Slider } from "../../components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { ArrowLeft, Play, Pause, Download, Volume2, VolumeX, Maximize, Loader2, ImageIcon, Image, Pencil, Trash2, Check, X, PlayCircle, ChevronDown, Plus, Type, Music, Upload, Sparkles, ExternalLink, MoreHorizontal, Coins, Copy, Layers, HelpCircle, Search, ChevronRight, MessageCircle } from "lucide-react";
import { WordByWordCaption, SimpleCaption, type WordTimestamp } from "../../components/WordByWordCaption";
import { EffectSelectionModal } from "../../components/EffectSelectionModal";
import { OverlaySelectionModal } from "../../components/OverlaySelectionModal";
import type { EffectType } from "../../lib/videoEffects";
import { getEffectAnimationClass } from "../../lib/videoEffects";
import { useCredits } from "../../hooks/useCredits";
import { CREDIT_COSTS, calculateVideoUploadCost } from "../../lib/creditConstants";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { knowledgeBase, categories, type KnowledgeArticle } from "@/lib/knowledgeBase";
import { trackEvent } from "@/lib/analytics";
import { getFontsByCategory } from "@/lib/fonts";

type Scene = {
  id?: string;
  text: string;
  scene_description?: string;
  order: number;
  image_url?: string;
  video_url?: string;
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
  const { balance: creditBalance, refetch: refetchCredits } = useCredits();
  const { user, loading: authLoading } = useAuth();

  const [story, setStory] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [video, setVideo] = useState<Video | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  const [generatingAudios, setGeneratingAudios] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ current: 0, total: 0 });
  const [generatingSceneImage, setGeneratingSceneImage] = useState<Set<number>>(new Set());
  const [generatingSceneAudio, setGeneratingSceneAudio] = useState<Set<number>>(new Set());
  const [uploadingSceneVideo, setUploadingSceneVideo] = useState<Set<number>>(new Set());
  const [videoUploadProgress, setVideoUploadProgress] = useState<{ [key: number]: number }>({});
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedVideoSceneIndex, setSelectedVideoSceneIndex] = useState<number | null>(null);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const videoProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [imageStyle, setImageStyle] = useState<string>("cinematic illustration");
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editSceneDescription, setEditSceneDescription] = useState("");
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [mobileSettingsDialogOpen, setMobileSettingsDialogOpen] = useState(false);
  const [mobileEditDialogOpen, setMobileEditDialogOpen] = useState(false);
  const [modifiedScenes, setModifiedScenes] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<number | null>(null);
  const [deletingScene, setDeletingScene] = useState(false);
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
  const videoElementsRef = useRef<{ [key: number]: HTMLVideoElement | null }>({});
  const captionSettingsLoadedRef = useRef(false); // Track if caption settings have been loaded from DB
  const bgMusicSettingsLoadedRef = useRef(false); // Track if background music settings have been loaded from DB
  const hasFetchedRef = useRef(false); // Track if story has been fetched to prevent duplicates
  const currentStoryIdRef = useRef<string | null>(null); // Track current story ID

  // Effect selection modal state
  const [effectModalOpen, setEffectModalOpen] = useState(false);
  const [selectedEffectScene, setSelectedEffectScene] = useState<number | null>(null);

  // Overlay selection modal state
  const [overlayModalOpen, setOverlayModalOpen] = useState(false);
  const [selectedOverlayScene, setSelectedOverlayScene] = useState<number | null>(null);
  const [overlays, setOverlays] = useState<Array<{id: string, name: string, category: string, file_url: string, thumbnail_url: string | null}>>([]);

  // Video generation success dialog state
  const [videoSuccessDialogOpen, setVideoSuccessDialogOpen] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedVideoDuration, setGeneratedVideoDuration] = useState<number>(0);

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

  // Format voice labels for display
  const formatVoiceLabels = (labels?: Record<string, any>): string => {
    if (!labels) return '';
    return Object.entries(labels)
      .filter(([_, value]) => value && typeof value === 'string')
      .slice(0, 3)
      .map(([_, value]) => {
        // Convert underscores to spaces and capitalize each word
        return value.split('_').map((word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      })
      .join(' • ');
  };

  // Audio drawer state
  const [audioDrawerOpen, setAudioDrawerOpen] = useState(false);
  const [audioDrawerScene, setAudioDrawerScene] = useState<number | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("alloy"); // Default OpenAI voice
  const [voices, setVoices] = useState<Array<{id: string; name: string; preview_url?: string; labels?: Record<string, any>}>>([]);
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

  // Video upload drawer state
  const [videoDrawerOpen, setVideoDrawerOpen] = useState(false);
  const [videoDrawerScene, setVideoDrawerScene] = useState<number | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoFileDuration, setVideoFileDuration] = useState<number>(0);
  const [loadingVideoDuration, setLoadingVideoDuration] = useState(false);
  const [videoImportMode, setVideoImportMode] = useState<'file' | 'youtube'>('file');
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [creditConfirmOpen, setCreditConfirmOpen] = useState(false);
  const [creditConfirmAction, setCreditConfirmAction] = useState<{
    title: string;
    message: string;
    credits: number;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
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
  const [captionFontSize, setCaptionFontSize] = useState(18); // Good default for readability
  const [captionFontWeight, setCaptionFontWeight] = useState(600); // Semi-bold by default
  const [captionFontFamily, setCaptionFontFamily] = useState("Montserrat"); // Default font
  const [captionActiveColor, setCaptionActiveColor] = useState("#02f7f3"); // Cyan highlight
  const [captionInactiveColor, setCaptionInactiveColor] = useState("#FFFFFF"); // White
  const [captionWordsPerBatch, setCaptionWordsPerBatch] = useState(3); // Default 3 words at a time
  const [captionTextTransform, setCaptionTextTransform] = useState<"none" | "uppercase" | "lowercase" | "capitalize">("none");
  const [leftPanelView, setLeftPanelView] = useState<"scenes" | "captions" | "background_music" | "preview" | "help">("scenes");
  const [mobileView, setMobileView] = useState<"timeline" | "preview">("timeline"); // Mobile: show timeline or preview
  const [runTour, setRunTour] = useState(false); // Product tour state

  // Help Page State
  const [helpSearchQuery, setHelpSearchQuery] = useState('');
  const [selectedHelpArticle, setSelectedHelpArticle] = useState<KnowledgeArticle | null>(null);
  const [selectedHelpCategory, setSelectedHelpCategory] = useState<string | null>(null);

  // Background Music State
  const [bgMusicEnabled, setBgMusicEnabled] = useState(false);
  const [bgMusicId, setBgMusicId] = useState<string | null>(null);
  const [bgMusicUrl, setBgMusicUrl] = useState<string | null>(null);
  const [bgMusicName, setBgMusicName] = useState<string | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(8); // Default 8% volume
  const [bgMusicUploading, setBgMusicUploading] = useState(false);
  const [bgMusicPlaying, setBgMusicPlaying] = useState(false);
  const bgMusicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Music Library Preview (separate from story playback)
  const [musicPreviewPlaying, setMusicPreviewPlaying] = useState<string | null>(null);
  const musicPreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Music Library State
  const [musicLibrary, setMusicLibrary] = useState<any[]>([]);
  const [musicLibraryLoading, setMusicLibraryLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [deleteMusicDialog, setDeleteMusicDialog] = useState<{open: boolean; music: any | null}>({open: false, music: null});
  const [deletingMusic, setDeletingMusic] = useState(false);

  // Stuck job dialog state
  const [stuckJobDialogOpen, setStuckJobDialogOpen] = useState(false);
  const [clearingStuckJob, setClearingStuckJob] = useState(false);
  const [stuckImageJobDialogOpen, setStuckImageJobDialogOpen] = useState(false);
  const [clearingImageJob, setClearingImageJob] = useState(false);

  // Import dialogs
  const [importUrlDialog, setImportUrlDialog] = useState(false);
  const [importYoutubeDialog, setImportYoutubeDialog] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [importNotes, setImportNotes] = useState("");
  const [importing, setImporting] = useState(false);

  // Use ref for immediate cancellation without state delays
  const previewCancelledRef = useRef(false);
  const currentPreviewRef = useRef<Promise<void> | null>(null);
  const volumeRef = useRef(volume); // Track current volume with ref

  // Keep volumeRef in sync with volume state
  // Redirect to homepage if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Update background music volume when it changes
  useEffect(() => {
    if (bgMusicAudioRef.current) {
      // Apply background music volume directly (not affected by master volume slider)
      // This matches what will be in the generated video
      bgMusicAudioRef.current.volume = bgMusicVolume / 100;
    }
  }, [bgMusicVolume]);


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
    const handleRouteChange = () => {
      console.log("🧹 Route changing: stopping all audio");
      // Stop all audio immediately before navigation
      previewCancelledRef.current = true;
      setIsPlayingPreview(false);

      // Stop background music
      if (bgMusicAudioRef.current) {
        bgMusicAudioRef.current.pause();
        bgMusicAudioRef.current = null;
      }

      // Stop all audio elements on page
      const audios = document.querySelectorAll('audio');
      audios.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });

      // Clear intervals
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };

    // Silent cleanup (no state updates to avoid hot reload issues)
    const cleanupAudio = () => {
      previewCancelledRef.current = true;

      // Stop background music
      if (bgMusicAudioRef.current) {
        bgMusicAudioRef.current.pause();
        bgMusicAudioRef.current = null;
      }

      // Stop all audio elements on page
      const audios = document.querySelectorAll('audio');
      audios.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });

      // Clear intervals
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };

    // Listen for route changes
    router.events.on('routeChangeStart', handleRouteChange);

    // Cleanup on unmount - use empty dependency array to prevent re-registration
    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
      cleanupAudio(); // Silent cleanup without state updates
    };
  }, []); // Empty dependency array to prevent re-registration

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

  // Helper function to get authenticated headers
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("Please log in to continue");
    }
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`
    };
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

            // Set timeout to prevent getting stuck on mobile
            const timeout = setTimeout(() => {
              console.warn(`⏱️ Audio preload timeout for scene ${actualIndex}, continuing anyway`);
              audioCache[actualIndex] = audioElement;
              resolve(void 0);
            }, 3000); // 3 second timeout

            // Use loadedmetadata instead of canplaythrough for better mobile compatibility
            audioElement.onloadedmetadata = () => {
              clearTimeout(timeout);
              audioCache[actualIndex] = audioElement;
              resolve(void 0);
            };
            audioElement.onerror = () => {
              clearTimeout(timeout);
              resolve(void 0); // Continue even if audio fails
            };
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

  const fetchStory = useCallback(async (showLoading = true, forceMediaReload = false) => {
    if (!id) return;

    console.log("📡 Fetching story details for ID:", id);
    if (showLoading) {
      setLoading(true);
    }

    // If forcing media reload, clear cache immediately
    if (forceMediaReload) {
      console.log("🔄 Forcing media reload - clearing cache");
      setMediaPreloaded(false);
      setPreloadedAudio({});
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session
        ? { "Authorization": `Bearer ${session.access_token}` }
        : {};

      const res = await fetch(`/api/get_story_details?id=${id}`, { headers });
      const data = await res.json();
      console.log("📊 Story data received:", data);

      // Add cache-busting timestamp to all images and audio to force browser to reload
      // Use timestamp + random to ensure uniqueness even if fetched multiple times in same millisecond
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const scenesWithTimestamp = (data.scenes || []).map((scene: any) => ({
        ...scene,
        image_url: scene.image_url ? `${scene.image_url}?t=${timestamp}&r=${random}` : scene.image_url,
        video_url: scene.video_url ? `${scene.video_url}?t=${timestamp}&r=${random}` : scene.video_url,
        audio_url: scene.audio_url ? `${scene.audio_url}?t=${timestamp}&r=${random}` : scene.audio_url
      }));

      if (forceMediaReload) {
        console.log("📸 Force reload - updating scenes with new cache-busted URLs");
        console.log("📸 Sample image URLs:", scenesWithTimestamp.slice(0, 2).map((s: any, i: number) => ({
          index: i,
          has_image: !!s.image_url,
          url_preview: s.image_url ? s.image_url.substring(0, 120) : 'null'
        })));
      }

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
        setCaptionFontSize(settings.fontSize ?? 18);
        setCaptionFontWeight(settings.fontWeight ?? 600);
        setCaptionPositionFromBottom(settings.positionFromBottom ?? 20);
        setCaptionActiveColor(settings.activeColor ?? "#02f7f3");
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
        setBgMusicVolume(bgSettings.volume ?? 4);
        console.log("🎵 Loaded background music settings from database:", bgSettings);
      }

      // Load aspect ratio from database if available
      if (data.story?.aspect_ratio) {
        const ratio = data.story.aspect_ratio as "9:16" | "16:9" | "1:1";
        setAspectRatio(ratio);
        console.log("📐 Loaded aspect ratio from database:", ratio);
      }

      // Load voices if not already loaded (for story voice selector)
      if (voices.length === 0) {
        fetchVoices();
      }

      // Preload media assets after setting state - only if not already preloaded OR forcing reload
      if (data.scenes?.length > 0 && (forceMediaReload || !mediaPreloaded)) {
        preloadMedia(data.scenes);
      }

    } catch (err) {
      console.error("❌ Error fetching story:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id to prevent infinite loops

  // Fetch overlay effects from library
  const fetchOverlays = useCallback(async () => {
    try {
      // Include aspect ratio in request to get aspect-ratio-specific overlays
      const aspectRatioParam = story?.aspect_ratio ? `?aspect_ratio=${encodeURIComponent(story.aspect_ratio)}` : '';
      const res = await fetch(`/api/overlays/library${aspectRatioParam}`);
      const data = await res.json();

      if (data.overlays) {
        setOverlays(data.overlays);
      }
    } catch (error) {
      console.error('Error fetching overlays:', error);
    }
  }, [story?.aspect_ratio]);

  // Fetch and update a single scene's details
  const fetchAndUpdateScene = useCallback(async (sceneId: string): Promise<{scene: any, index: number} | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session
        ? { "Authorization": `Bearer ${session.access_token}` }
        : {};

      const res = await fetch(`/api/get_scene_details?id=${sceneId}`, { headers });
      const data = await res.json();

      if (!data.scene) return null;

      // Add cache-busting to URLs
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const updatedScene = {
        ...data.scene,
        image_url: data.scene.image_url ? `${data.scene.image_url}?t=${timestamp}&r=${random}` : data.scene.image_url,
        video_url: data.scene.video_url ? `${data.scene.video_url}?t=${timestamp}&r=${random}` : data.scene.video_url,
        audio_url: data.scene.audio_url ? `${data.scene.audio_url}?t=${timestamp}&r=${random}` : data.scene.audio_url
      };

      let sceneIndex = -1;

      // Update only this scene in the scenes array
      setScenes(prevScenes => {
        sceneIndex = prevScenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return prevScenes;

        const newScenes = [...prevScenes];
        newScenes[sceneIndex] = updatedScene;
        return newScenes;
      });

      return sceneIndex >= 0 ? { scene: updatedScene, index: sceneIndex } : null;

    } catch (err) {
      console.error("Error fetching scene:", err);
      return null;
    }
  }, []);

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
    fetchOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, id]); // Only depend on router.isReady and id

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.id) {
        setIsAdmin(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();

        setIsAdmin(data?.is_admin === true);
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, [user?.id]);

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
      const headers = await getAuthHeaders();
      const res = await fetch("/api/save_caption_settings", {
        method: "POST",
        headers,
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
      if (user?.id) params.append("user_id", user.id);

      const res = await fetch(`/api/music/library?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMusicLibrary(data.music || []);
        console.log("🎵 Loaded music library:", data.music?.length, "tracks");
      } else {
        console.error("❌ Failed to fetch music library");
      }
    } catch (err) {
      console.error("❌ Error fetching music library:", err);
    } finally {
      setMusicLibraryLoading(false);
    }
  }, [user?.id]);

  // Save background music settings to database
  const saveBgMusicSettings = useCallback(async () => {
    if (!id) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/story/${id}/background_music`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
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
    if (leftPanelView === "background_music") {
      fetchMusicLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftPanelView]);

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
    // Check if preview is currently playing and get current timestamp
    const isPreviewPlaying = isPlayingPreview;
    const currentMusicTime = bgMusicAudioRef.current?.currentTime || 0;

    console.log(`🎵 Selecting new music: ${music.name}, preview playing: ${isPreviewPlaying}, current time: ${currentMusicTime}s`);

    // Stop current music if playing
    if (bgMusicAudioRef.current) {
      bgMusicAudioRef.current.pause();
      bgMusicAudioRef.current = null;
      setBgMusicPlaying(false);
    }

    // Stop preview audio if playing
    if (musicPreviewAudioRef.current) {
      musicPreviewAudioRef.current.pause();
      musicPreviewAudioRef.current = null;
      setMusicPreviewPlaying(null);
    }

    setBgMusicId(music.id);
    setBgMusicUrl(music.file_url);
    setBgMusicName(music.name);
    setBgMusicEnabled(true);
    console.log("🎵 Selected music from library:", music.name);

    // If preview was playing, restart with new music from same timestamp
    if (isPreviewPlaying && music.file_url) {
      setTimeout(() => {
        // Create new audio element with the new music
        const newAudio = new Audio(music.file_url);
        // Apply background music volume directly (matches generated video)
        newAudio.volume = bgMusicVolume / 100;
        newAudio.loop = false;
        bgMusicAudioRef.current = newAudio;

        // Set to saved timestamp and play
        newAudio.addEventListener('loadedmetadata', () => {
          newAudio.currentTime = currentMusicTime;
          newAudio.play().catch(err => {
            console.error("Failed to play new background music:", err);
          });
          console.log(`🎵 Switched to new music and resumed from ${currentMusicTime.toFixed(1)}s`);
        });
      }, 50);
    }
  }, [isPlayingPreview, bgMusicVolume, volume]);

  // Handle delete music
  const handleDeleteMusic = (music: any) => {
    setDeleteMusicDialog({ open: true, music });
  };

  const confirmDeleteMusic = async () => {
    const music = deleteMusicDialog.music;
    if (!music || !user?.id) return;

    setDeletingMusic(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/music/library/${music.id}?user_id=${user.id}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        // Remove from library state
        setMusicLibrary(prev => prev.filter(m => m.id !== music.id));

        // If this was the selected music, clear selection
        if (bgMusicId === music.id) {
          setBgMusicId(null);
          setBgMusicUrl(null);
          setBgMusicName(null);
          setBgMusicEnabled(false);
          if (bgMusicAudioRef.current) {
            bgMusicAudioRef.current.pause();
            bgMusicAudioRef.current = null;
            setBgMusicPlaying(false);
          }
        }

        toast({ description: "Music deleted successfully" });
      } else {
        const error = await res.json();
        toast({ description: error.error || "Failed to delete music", variant: "destructive" });
      }
    } catch (err) {
      console.error("Error deleting music:", err);
      toast({ description: "Failed to delete music", variant: "destructive" });
    } finally {
      setDeletingMusic(false);
      setDeleteMusicDialog({ open: false, music: null });
    }
  };

  // Handle import from URL
  const handleImportFromUrl = async () => {
    if (!importUrl || !importName || !user) return;

    setImporting(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/music/import-url", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: importUrl,
          name: importName,
          description: `Imported from URL on ${new Date().toLocaleDateString()}`,
          category: "other",
          notes: importNotes,
          uploaded_by: user.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Add to library and select
        if (data.music) {
          setMusicLibrary(prev => [data.music, ...prev]);
          handleSelectMusicFromLibrary(data.music);
        }

        toast({ description: "Music imported successfully" });
        setImportUrlDialog(false);
        setImportUrl("");
        setImportName("");
        setImportNotes("");
      } else {
        const error = await res.json();
        toast({ description: error.error || "Failed to import music", variant: "destructive" });
      }
    } catch (err) {
      console.error("Import error:", err);
      toast({ description: "Failed to import music from URL", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  // Handle import from YouTube
  const handleImportFromYoutube = async () => {
    if (!importUrl || !importName || !user) return;

    setImporting(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/music/import-youtube", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: importUrl,
          name: importName,
          description: `Imported from YouTube on ${new Date().toLocaleDateString()}`,
          category: "other",
          notes: importNotes,
          uploaded_by: user.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Add to library and select
        if (data.music) {
          setMusicLibrary(prev => [data.music, ...prev]);
          handleSelectMusicFromLibrary(data.music);
        }

        toast({ description: "Music imported from YouTube successfully" });
        setImportYoutubeDialog(false);
        setImportUrl("");
        setImportName("");
        setImportNotes("");
      } else {
        const error = await res.json();
        toast({ description: error.error || "Failed to import music from YouTube", variant: "destructive" });
      }
    } catch (err) {
      console.error("YouTube import error:", err);
      toast({ description: "Failed to import music from YouTube", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to upload music");
      }

      const res = await fetch("/api/music/library", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        },
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

    if (!bgMusicAudioRef.current || bgMusicAudioRef.current.src !== bgMusicUrl) {
      // Create new audio element if it doesn't exist or URL changed
      if (bgMusicAudioRef.current) {
        bgMusicAudioRef.current.pause();
      }
      bgMusicAudioRef.current = new Audio(bgMusicUrl);
      bgMusicAudioRef.current.loop = true; // Loop only for standalone playback
      bgMusicAudioRef.current.volume = bgMusicVolume / 100;
    }

    if (bgMusicPlaying) {
      bgMusicAudioRef.current.pause();
      setBgMusicPlaying(false);
    } else {
      bgMusicAudioRef.current.play().catch(err => {
        console.error("Failed to play background music:", err);
        setBgMusicPlaying(false);
      });
      setBgMusicPlaying(true);
    }
  };

  // Handle music library preview (at fixed volume 20%)
  const toggleMusicPreview = (music: any) => {
    if (!music.file_url) return;

    // If already playing this preview, stop it
    if (musicPreviewPlaying === music.id && musicPreviewAudioRef.current) {
      musicPreviewAudioRef.current.pause();
      musicPreviewAudioRef.current = null;
      setMusicPreviewPlaying(null);
      return;
    }

    // Stop any currently playing preview
    if (musicPreviewAudioRef.current) {
      musicPreviewAudioRef.current.pause();
      musicPreviewAudioRef.current = null;
    }

    // Play new preview at volume 20%
    const audio = new Audio(music.file_url);
    audio.volume = 0.20; // Fixed volume 20% for preview
    audio.loop = true;
    musicPreviewAudioRef.current = audio;
    setMusicPreviewPlaying(music.id);

    audio.play().catch(err => {
      console.error("Failed to play music preview:", err);
      setMusicPreviewPlaying(null);
      musicPreviewAudioRef.current = null;
    });

    audio.onended = () => {
      setMusicPreviewPlaying(null);
      musicPreviewAudioRef.current = null;
    };
  };

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

    // Show generating state and spinner immediately
    setGeneratingImages(true);
    setImageProgress({ current: 0, total: scenes.length });

    // Show spinners on all scene tile buttons
    setGeneratingSceneImage(prev => {
      const newSet = new Set(prev);
      scenes.forEach((_, index) => newSet.add(index));
      return newSet;
    });

    try {
      // Show progress as processing
      setImageProgress({ current: 1, total: scenes.length });

      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to generate images");
      }

      const res = await fetch("/api/generate_images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          story_id: id,
          style: style || selectedImageStyle || imageStyle,
          instructions: instructions || imageInstructions
        }),
      });

      if (res.status === 409) {
        // Image generation already in progress - clear states and show dialog
        setGeneratingImages(false);
        setImageProgress({ current: 0, total: 0 });
        setGeneratingSceneImage(new Set());
        setStuckImageJobDialogOpen(true);
        return;
      }

      // Close drawer only after successful generation starts
      setBulkImageDrawerOpen(false);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Image generation failed");
      }
      const result = await res.json();

      // Set progress to complete
      setImageProgress({ current: scenes.length, total: scenes.length });

      console.log("🔄 Image generation complete, refetching story data...");

      // CRITICAL: Clear spinners BEFORE fetching to prevent UI state conflicts
      setGeneratingSceneImage(new Set());

      // Refetch entire story details to get fresh data with all fields (without showing loading screen)
      // Force media reload to load new images
      await fetchStory(false, true);

      console.log("✅ Story data refetched with new image URLs");

      // Refetch credit balance
      await refetchCredits();

      // Show success or partial success toast
      if (result.partial_failure) {
        toast({
          description: `⚠️ Generated ${result.success_count}/${result.total_scenes} images. Failed scenes: ${result.failed_scenes.join(', ')}`,
          variant: "destructive"
        });
      } else {
        toast({ description: `✨ Images generated for all ${scenes.length} scenes!` });
      }
    } catch (err) {
      console.error("Image generation error:", err);
      toast({ description: `Failed to generate images: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setGeneratingImages(false);
      setImageProgress({ current: 0, total: 0 });
      // Ensure spinners are cleared (in case of error path)
      setGeneratingSceneImage(new Set());
    }
  };

  const generateAllAudio = async (voiceId?: string) => {
    if (!id) return;
    setGeneratingAudios(true);
    setAudioProgress({ current: 0, total: scenes.length });
    setBulkAudioDrawerOpen(false); // Close drawer when generation starts

    // Show spinners on all scene tile buttons
    setGeneratingSceneAudio(prev => {
      const newSet = new Set(prev);
      scenes.forEach((_, index) => newSet.add(index));
      return newSet;
    });

    try {
      const finalVoiceId = voiceId || story?.voice_id || "alloy";

      // Show progress as the API processes
      setAudioProgress({ current: 1, total: scenes.length });

      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to generate audio");
      }

      const res = await fetch("/api/generate_all_audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          story_id: id,
          voice_id: finalVoiceId
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Audio generation failed");
      }
      await res.json();

      // Set complete
      setAudioProgress({ current: scenes.length, total: scenes.length });

      // Update story voice to the selected voice (only for bulk generation)
      try {
        const headers = await getAuthHeaders();
        const voiceUpdateRes = await fetch("/api/update_story_voice", {
          method: "POST",
          headers,
          body: JSON.stringify({
            story_id: id,
            voice_id: finalVoiceId
          }),
        });

        if (voiceUpdateRes.ok) {
          console.log(`✅ Story voice updated to: ${finalVoiceId}`);
        }
      } catch (voiceErr) {
        console.error("⚠️ Failed to update story voice:", voiceErr);
        // Don't fail the whole operation if voice update fails
      }

      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsPlayingPreview(false);
      setSelectedScene(0);

      // Refetch entire story details to get fresh data with all fields (without showing loading screen)
      const storyRes = await fetch(`/api/get_story_details?id=${id}`);
      const data = await storyRes.json();

      if (data.story && data.scenes) {
        setStory(data.story);
        setScenes(data.scenes);
        setVideo(data.video || null);

        // Explicitly reload audio for all scenes
        console.log("🔄 Reloading audio after bulk generation...");
        await preloadMedia(data.scenes);
      }

      // Refetch credit balance
      await refetchCredits();

      // Show success toast
      toast({ description: `🎙️ Audio generated for all ${scenes.length} scenes!` });
    } catch (err) {
      console.error("Bulk audio generation error:", err);
      toast({ description: `Failed to generate audio: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setGeneratingAudios(false);
      setAudioProgress({ current: 0, total: 0 });
      // Clear all scene spinners
      setGeneratingSceneAudio(new Set());
    }
  };

  const loadSampleImages = async () => {
    setLoadingSampleImages(true);
    console.log("🎨 Loading sample images for all styles...");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/generate_sample_images", {
        method: "POST",
        headers,
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

    setGeneratingSceneImage(prev => {
      const newSet = new Set(prev);
      newSet.add(sceneIndex);
      return newSet;
    });

    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to generate image");
      }

      const res = await fetch("/api/generate_scene_image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
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
      await res.json();

      // Refetch only this scene's details (incremental update)
      const sceneId = scenes[sceneIndex]?.id;
      if (sceneId) {
        await fetchAndUpdateScene(sceneId);
      }

      // Refetch credit balance
      await refetchCredits();

      // Show success toast
      toast({ description: `✨ Image generated for scene ${sceneIndex + 1}` });

    } catch (err) {
      console.error("Scene image generation error:", err);
      toast({ description: `Failed to generate image: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setGeneratingSceneImage(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
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

    // Valid OpenAI voices: alloy, echo, fable, onyx, nova, shimmer, ash, coral, sage
    // Also support old ElevenLabs voice IDs (20+ character alphanumeric strings)
    const isValidVoiceId = (voiceId: string | undefined) => {
      if (!voiceId) return false;
      // OpenAI voices (4-7 characters) or ElevenLabs IDs (20+ characters)
      return /^[a-zA-Z0-9]+$/.test(voiceId) && voiceId.length >= 3;
    };

    const sceneVoiceId = isValidVoiceId(scene?.voice_id) ? scene.voice_id : null;
    const voiceToUse = sceneVoiceId || story?.voice_id || "alloy";

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

  // Handle video file selection for scene
  const handleSceneVideoUpload = async (sceneIndex: number, file: File) => {
    const scene = scenes[sceneIndex];
    if (!scene || !scene.id) return;

    try {
      setUploadingSceneVideo(prev => new Set(prev).add(sceneIndex));
      setVideoUploadProgress(prev => ({ ...prev, [sceneIndex]: 0 }));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to upload videos");
      }

      // Create form data
      const formData = new FormData();
      formData.append('scene_id', scene.id);
      formData.append('video', file);

      // Upload with progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setVideoUploadProgress(prev => ({ ...prev, [sceneIndex]: progress }));
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);

          toast({
            title: "✅ Video Uploaded Successfully",
            description: `Scene ${sceneIndex + 1} video uploaded and transcribed`,
          });

          // Refresh story data to get updated scene
          await fetchStory(false, true);
        } else {
          const error = JSON.parse(xhr.responseText);
          toast({
            title: "❌ Upload Failed",
            description: error.error || 'Upload failed',
            variant: "destructive",
          });
        }

        // Clear uploading state after completion (success or failure)
        setUploadingSceneVideo(prev => {
          const newSet = new Set(prev);
          newSet.delete(sceneIndex);
          return newSet;
        });
        setVideoUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[sceneIndex];
          return newProgress;
        });
      });

      xhr.addEventListener('error', () => {
        toast({
          title: "❌ Upload Failed",
          description: 'Network error during upload',
          variant: "destructive",
        });

        // Clear uploading state on network error
        setUploadingSceneVideo(prev => {
          const newSet = new Set(prev);
          newSet.delete(sceneIndex);
          return newSet;
        });
        setVideoUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[sceneIndex];
          return newProgress;
        });
      });

      xhr.open('POST', '/api/upload-scene-video');
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.send(formData);

    } catch (err: any) {
      console.error('Error uploading video:', err);
      toast({
        title: "❌ Upload Failed",
        description: err.message || "Failed to upload video",
        variant: "destructive",
      });

      // Clear uploading state on exception
      setUploadingSceneVideo(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
      setVideoUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[sceneIndex];
        return newProgress;
      });
    }
  };

  // Open video upload drawer
  const openVideoUpload = (sceneIndex: number) => {
    setVideoDrawerScene(sceneIndex);
    setSelectedVideoFile(null);
    setVideoFileDuration(0);
    setYoutubeUrl('');
    setVideoImportMode('file');
    setVideoDrawerOpen(true);
  };

  // Handle YouTube video import
  const handleYouTubeVideoImport = async (sceneIndex: number, url: string) => {
    const scene = scenes[sceneIndex];
    if (!scene || !scene.id) return;

    try {
      setUploadingSceneVideo(prev => new Set(prev).add(sceneIndex));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to import videos");
      }

      const response = await fetch('/api/import-youtube-video', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scene_id: scene.id,
          youtube_url: url,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }

      const result = await response.json();

      toast({
        title: "✅ Video Imported Successfully",
        description: `YouTube video imported and transcribed for scene ${sceneIndex + 1}`,
      });

      // Refresh story data to get updated scene
      await fetchStory(false, true);

    } catch (err: any) {
      console.error('Error importing YouTube video:', err);
      toast({
        title: "❌ Import Failed",
        description: err.message || "Failed to import YouTube video",
        variant: "destructive",
      });
    } finally {
      setUploadingSceneVideo(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
    }
  };

  // Handle video file selection in drawer
  const handleVideoFileSelected = async (file: File) => {
    setSelectedVideoFile(file);
    setLoadingVideoDuration(true);

    // Get video duration for credit calculation
    try {
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';

      videoElement.onloadedmetadata = () => {
        window.URL.revokeObjectURL(videoElement.src);
        const duration = videoElement.duration;
        setVideoFileDuration(duration);
        setLoadingVideoDuration(false);
      };

      videoElement.onerror = () => {
        setLoadingVideoDuration(false);
        toast({
          title: "Error",
          description: "Could not read video file. Please try a different file.",
          variant: "destructive"
        });
      };

      videoElement.src = URL.createObjectURL(file);
    } catch (error) {
      setLoadingVideoDuration(false);
      toast({
        title: "Error",
        description: "Could not read video file",
        variant: "destructive"
      });
    }
  };

  // Handle file input change
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedVideoSceneIndex !== null) {
      // Validate file
      if (!file.type.startsWith('video/')) {
        toast({
          title: "❌ Invalid File",
          description: "Please select a video file",
          variant: "destructive",
        });
        return;
      }

      // Check file size (200MB max)
      const maxSize = 200 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "❌ File Too Large",
          description: "Maximum file size is 200MB",
          variant: "destructive",
        });
        return;
      }

      handleSceneVideoUpload(selectedVideoSceneIndex, file);
    }

    // Reset file input
    if (e.target) {
      e.target.value = '';
    }
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
      const headers = await getAuthHeaders();
      const res = await fetch("/api/update_story_voice", {
        method: "POST",
        headers,
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

    setGeneratingSceneAudio(prev => {
      const newSet = new Set(prev);
      newSet.add(sceneIndex);
      return newSet;
    });

    try {
      const voiceToUse = voiceId || selectedVoiceId;

      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to generate audio");
      }

      const res = await fetch("/api/generate_audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          scene_id: scenes[sceneIndex].id,
          voice_id: voiceToUse
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Scene audio generation failed");
      }

      await res.json(); // Consume response

      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsPlayingPreview(false);
      setSelectedScene(0);

      // Refetch only this scene's details (incremental update)
      const sceneId = scenes[sceneIndex]?.id;
      if (sceneId) {
        const result = await fetchAndUpdateScene(sceneId);

        // Reload just this scene's audio
        if (result) {
          setPreloadedAudio(prev => {
            const updated = {...prev};
            delete updated[result.index]; // Remove old audio

            // Preload new audio for this scene
            if (result.scene.audio_url) {
              const audioElement = new Audio(result.scene.audio_url);
              audioElement.volume = volume;
              audioElement.preload = 'metadata';
              updated[result.index] = audioElement;
            }

            return updated;
          });
        }
      }

      // Refetch credit balance
      await refetchCredits();

      // Show success toast
      toast({ description: `🎙️ Audio generated for scene ${sceneIndex + 1}` });

    } catch (err) {
      console.error("Scene audio generation error:", err);
      toast({ description: `Failed to generate audio: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setGeneratingSceneAudio(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
    }
  };

  const handleDownloadVideo = async () => {
    if (!video?.video_url) return;

    setDownloadConfirmOpen(false);
    setDownloadingVideo(true);

    // Track analytics event
    trackEvent('download_clicked', {
      story_id: id,
      story_title: story?.title,
      video_duration: video?.duration
    });

    try {
      const response = await fetch(video.video_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story?.title || 'video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Download started!",
        description: "Your video is being downloaded",
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download failed",
        description: "Please try again or use 'Open in New Tab'",
        variant: "destructive"
      });
    } finally {
      setDownloadingVideo(false);
    }
  };

  const generateVideo = async () => {
    if (!id || typeof id !== 'string') return;

    setGeneratingVideo(true);
    setVideoProgress(0);

    // Simulate progress based on estimated time (video generation takes ~20-40 seconds)
    const startTime = Date.now();
    const estimatedDuration = 30000; // 30 seconds estimate

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const estimatedProgress = Math.min(95, Math.floor((elapsed / estimatedDuration) * 100));
      setVideoProgress(estimatedProgress);
    }, 500); // Update every 500ms

    videoProgressIntervalRef.current = progressInterval;

    try {
      console.log("🎬 Starting SERVER-SIDE video generation for story:", id);

      const headers = await getAuthHeaders();
      const res = await fetch("/api/generate_video", {
        method: "POST",
        headers,
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
            textTransform: captionTextTransform,
            style: 'custom',
            position: 'bottom'
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

        // Handle stuck job error (409 Conflict)
        if (res.status === 409 && errorData.error?.includes('already in progress')) {
          // Show dialog and return early - don't throw error
          console.log("ℹ️ Stuck job detected - showing dialog");
          setStuckJobDialogOpen(true);
          return; // Exit early without throwing
        }

        // Handle server busy error (429 Too Many Requests)
        if (res.status === 429) {
          console.log("ℹ️ Server busy - too many concurrent video generations");
          toast({
            title: "Server Busy",
            description: errorData.error || "The server is currently processing multiple videos. Please try again in a minute.",
            variant: "destructive",
          });
          return; // Exit early without throwing
        }

        throw new Error(errorData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      console.log("✅ Server-side video generation completed:", data);

      // Clear progress interval and set to 100%
      if (videoProgressIntervalRef.current) {
        clearInterval(videoProgressIntervalRef.current);
        videoProgressIntervalRef.current = null;
      }
      setVideoProgress(100);

      // Update video state
      setVideo({
        video_url: data.video_url,
        is_valid: data.is_valid,
        duration: data.duration
      });

      // Store video info and show success dialog
      setGeneratedVideoUrl(data.video_url);
      setGeneratedVideoDuration(data.duration);
      setVideoSuccessDialogOpen(true);

      // Show success toast
      toast({ description: `🎬 Video generated successfully! Duration: ${Math.floor(data.duration)}s` });
    } catch (err) {
      console.error("❌ Video generation error:", err);
      toast({ description: `Failed to generate video: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      // Clean up progress interval
      if (videoProgressIntervalRef.current) {
        clearInterval(videoProgressIntervalRef.current);
        videoProgressIntervalRef.current = null;
      }
      setGeneratingVideo(false);
      setVideoProgress(0);
    }
  };

  const clearStuckJob = async () => {
    if (!id || typeof id !== 'string') return;

    setClearingStuckJob(true);

    try {
      const headers = await getAuthHeaders();
      const clearRes = await fetch("/api/clear_video_job", {
        method: "POST",
        headers,
        body: JSON.stringify({ story_id: id }),
      });

      if (!clearRes.ok) {
        throw new Error('Failed to clear stuck job');
      }

      // Reset video generation state
      setGeneratingVideo(false);
      setVideoProgress(0);

      // Clear progress interval if exists
      if (videoProgressIntervalRef.current) {
        clearInterval(videoProgressIntervalRef.current);
        videoProgressIntervalRef.current = null;
      }

      toast({ description: 'Video Generation Stopped' });
      setStuckJobDialogOpen(false);
    } catch (err) {
      console.error("❌ Error stopping video generation:", err);
      toast({ description: `Failed to stop video generation: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setClearingStuckJob(false);
    }
  };

  const clearImageJob = async () => {
    if (!id || typeof id !== 'string') return;

    setClearingImageJob(true);

    try {
      const headers = await getAuthHeaders();
      const clearRes = await fetch("/api/clear_image_job", {
        method: "POST",
        headers,
        body: JSON.stringify({ story_id: id }),
      });

      if (!clearRes.ok) {
        throw new Error('Failed to cancel image generation');
      }

      toast({ description: 'Image generation cancelled. Starting new generation...' });
      setStuckImageJobDialogOpen(false);

      // Retry image generation after clearing
      await generateImages();
    } catch (err) {
      console.error("❌ Error cancelling image generation:", err);
      toast({ description: `Failed to cancel image generation: ${err instanceof Error ? err.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setClearingImageJob(false);
    }
  };

  const stopVideoPreview = () => {
    console.log("🛑 Stopping video preview");
    previewCancelledRef.current = true;
    setIsPlayingPreview(false);
    setIsSeeking(false);

    // Stop background music
    if (bgMusicAudioRef.current) {
      bgMusicAudioRef.current.pause();
    }

    // Stop preloaded audio elements (don't reset position - preserve for resume)
    Object.values(preloadedAudio).forEach(audio => {
      audio.pause();
      // Don't reset currentTime - preserve paused position
    });

    // Stop all video elements (don't reset position - preserve for resume)
    Object.values(videoElementsRef.current).forEach(video => {
      if (video) {
        video.pause();
        // Don't reset currentTime - preserve paused frame
        // Don't mute - preserve volume state
      }
    });

    // Also stop any other audio elements as fallback
    const audios = document.querySelectorAll('audio');
    audios.forEach(audio => {
      audio.pause();
      // Don't reset currentTime - preserve paused position
    });

    // Clear progress tracking
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    // Don't reset progress states - preserve position for resume
    // setSceneProgress(0);
    // setSceneDuration(0);
    // setCurrentTime(0);
    currentAudioRef.current = null;
  };

  // Seek to a specific time in the total video timeline
  const seekToTotalTime = async (targetTotalTime: number) => {
    console.log(`⏩ Seeking to ${targetTotalTime.toFixed(1)}s in total timeline`);
    setIsSeeking(true);

    // Find which scene this time belongs to
    const { sceneIndex, sceneTime } = getSceneAtTime(targetTotalTime);

    console.log(`📍 Time ${targetTotalTime.toFixed(1)}s is in scene ${sceneIndex + 1} at ${sceneTime.toFixed(1)}s`);

    // UPDATE UI IMMEDIATELY for smooth slider movement (before any async operations)
    setSelectedScene(sceneIndex);
    setSceneProgress(sceneTime);
    setTotalProgress(targetTotalTime);
    setCurrentTime(sceneTime); // Update current time for captions

    // Set duration based on media type
    const scene = scenes[sceneIndex];
    const videoElement = scene?.video_url ? videoElementsRef.current[sceneIndex] : null;
    if (videoElement && videoElement.duration) {
      setSceneDuration(videoElement.duration);
    } else if (preloadedAudio[sceneIndex]) {
      setSceneDuration(preloadedAudio[sceneIndex].duration);
    } else {
      // No media - use calculated duration from database
      setSceneDuration(scene?.duration || 5);
    }

    // Sync background music immediately as well
    if (bgMusicAudioRef.current && bgMusicEnabled) {
      try {
        bgMusicAudioRef.current.currentTime = targetTotalTime;
        console.log(`🎵 Background music seeked to ${targetTotalTime.toFixed(1)}s`);
      } catch (err) {
        console.error("Failed to seek background music:", err);
      }
    }

    // If we're in a different scene, stop current and switch
    if (sceneIndex !== selectedScene) {
      console.log(`🔄 Switching from scene ${selectedScene + 1} to scene ${sceneIndex + 1}`);
      const wasPlaying = isPlayingPreview;

      // IMPORTANT: Cancel the original preview loop completely
      previewCancelledRef.current = true;

      // Stop current playback (audio or video)
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }

      // Stop any playing video
      const currentVideo = videoElementsRef.current[selectedScene];
      if (currentVideo) {
        currentVideo.pause();
        currentVideo.currentTime = 0;
        currentVideo.muted = true;
      }

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // Wait for the old loop to fully stop
      await new Promise(resolve => setTimeout(resolve, 100));

      // Set up media for the new scene (video or audio)
      const targetScene = scenes[sceneIndex];
      if (targetScene?.video_url || preloadedAudio[sceneIndex]) {
        // Only resume playback if it was playing before seeking
        if (wasPlaying) {
          // Reset cancellation flag for the new loop
          previewCancelledRef.current = false;

          // Continue the preview loop from this scene and time
          continuePreviewFromPosition(sceneIndex, sceneTime);
        }
      }
    } else {
      // Same scene, just seek within it
      const scene = scenes[sceneIndex];
      const videoElement = scene?.video_url ? videoElementsRef.current[sceneIndex] : null;
      const audioElement = scene?.audio_url ? preloadedAudio[sceneIndex] : null;

      // If scene has video AND separate audio, seek both
      if (videoElement && audioElement && scene?.video_url && scene?.audio_url) {
        console.log(`🎯 Seeking video+audio to ${sceneTime.toFixed(2)}s`);
        const wasPlaying = isPlayingPreview;

        // Clear interval temporarily to prevent overwriting
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        // Pause both before seeking
        videoElement.pause();
        audioElement.pause();

        // Update currentAudioRef to point to this audio element
        currentAudioRef.current = audioElement;

        // Set time on both - CRITICAL: Do this after pause completes
        videoElement.currentTime = sceneTime;
        audioElement.currentTime = sceneTime;

        // Set audio volume to current volume (fixes muted audio after seek)
        audioElement.volume = volumeRef.current;

        // Update progress states immediately
        setSceneProgress(sceneTime);
        setTotalProgress(targetTotalTime);
        setCurrentTime(sceneTime);

        // Only resume playback if it was playing before seeking
        if (wasPlaying) {
          setIsPlayingPreview(true);

          // Restart progress tracking BEFORE playing
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[selectedScene];

          progressIntervalRef.current = setInterval(() => {
            if (audioElement && !audioElement.paused) {
              const currentSceneTime = audioElement.currentTime;
              setSceneProgress(currentSceneTime);
              setTotalProgress(cumulativeStart + currentSceneTime);
              setCurrentTime(currentSceneTime);

              // Keep video synced with audio
              if (videoElement && Math.abs(videoElement.currentTime - audioElement.currentTime) > 0.1) {
                videoElement.currentTime = audioElement.currentTime;
              }
            }
          }, 100);

          // Play audio FIRST (wait for it), then video
          try {
            await audioElement.play();
            console.log("✅ Audio playing at", audioElement.currentTime.toFixed(2), "s");
          } catch (err) {
            console.error("❌ Audio play failed:", err);
          }

          try {
            await videoElement.play();
            console.log("✅ Video playing at", videoElement.currentTime.toFixed(2), "s");
          } catch (err) {
            console.error("❌ Video play failed:", err);
          }
        }
      }
      // If scene has video only, seek video element
      else if (videoElement) {
        console.log(`🎯 Seeking video-only to ${sceneTime.toFixed(2)}s`);
        const wasPlaying = isPlayingPreview;

        // Clear interval temporarily to prevent overwriting
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        videoElement.pause();
        videoElement.currentTime = sceneTime;

        // Update progress states immediately
        setSceneProgress(sceneTime);
        setTotalProgress(targetTotalTime);
        setCurrentTime(sceneTime);

        // Only resume playback if it was playing before seeking
        if (wasPlaying) {
          setIsPlayingPreview(true);

          // Restart progress tracking
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[selectedScene];

          progressIntervalRef.current = setInterval(() => {
            if (videoElement && !videoElement.paused) {
              const currentSceneTime = videoElement.currentTime;
              setSceneProgress(currentSceneTime);
              setTotalProgress(cumulativeStart + currentSceneTime);
              setCurrentTime(currentSceneTime);
            }
          }, 100);

          try {
            await videoElement.play();
            console.log("✅ Video playing at", videoElement.currentTime.toFixed(2), "s");
          } catch (err) {
            console.error("❌ Video play error:", err);
          }
        }
      } else if (currentAudioRef.current) {
        // Otherwise, seek audio element (for image scenes)
        const audio = currentAudioRef.current;
        const wasPlaying = isPlayingPreview;

        // Clear interval temporarily to prevent overwriting
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        audio.pause();
        audio.currentTime = sceneTime;

        // Set audio volume to current volume (fixes muted audio after seek)
        audio.volume = volumeRef.current;

        // Update progress states immediately
        setSceneProgress(sceneTime);
        setTotalProgress(targetTotalTime);
        setCurrentTime(sceneTime);

        // If was playing, resume playback
        if (wasPlaying) {
          // Restart progress tracking
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[selectedScene];

          progressIntervalRef.current = setInterval(() => {
            if (audio && !audio.paused) {
              const currentSceneTime = audio.currentTime;
              setSceneProgress(currentSceneTime);
              setTotalProgress(cumulativeStart + currentSceneTime);
              setCurrentTime(currentSceneTime);
            }
          }, 100);

          try {
            await audio.play();
            console.log("✅ Audio resumed after seek");
          } catch (err) {
            console.error("❌ Audio play error:", err);
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

  // Continue preview from a specific scene and time (used when seeking during playback)
  const continuePreviewFromPosition = async (startSceneIndex: number, startSceneTime: number) => {
    console.log(`🎬 Continuing preview from scene ${startSceneIndex + 1} at ${startSceneTime.toFixed(1)}s`);

    // Don't stop - we're already playing, just continuing from new position
    previewCancelledRef.current = false;

    const playSceneFromTime = async (sceneIndex: number, startTime: number = 0) => {
      if (previewCancelledRef.current) return false;

      console.log(`🎬 Playing scene ${sceneIndex + 1} from ${startTime.toFixed(1)}s`);

      // Update selected scene
      setSelectedScene(sceneIndex);

      const scene = scenes[sceneIndex];

      // Handle video scenes with separate audio (uploaded video + AI narration)
      if (scene?.video_url && scene?.audio_url && videoElementsRef.current[sceneIndex] && preloadedAudio[sceneIndex]) {
        const videoElement = videoElementsRef.current[sceneIndex];
        const audio = preloadedAudio[sceneIndex];

        if (videoElement && audio) {
          console.log(`🎥🔊 Playing video+audio from ${startTime.toFixed(1)}s for scene ${sceneIndex + 1}`);

          // Set positions and volume
          videoElement.currentTime = startTime;
          videoElement.muted = true; // Mute video's own audio
          audio.currentTime = startTime;
          audio.volume = volumeRef.current;
          currentAudioRef.current = audio;

          const duration = audio.duration || scene.duration || 5;
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[sceneIndex];

          setSceneDuration(duration);
          setSceneProgress(startTime);
          setTotalProgress(cumulativeStart + startTime);
          setCurrentTime(startTime);

          try {
            // Start progress tracking
            progressIntervalRef.current = setInterval(() => {
              if (audio && !audio.paused) {
                const currentSceneTime = audio.currentTime;
                setSceneProgress(currentSceneTime);
                setTotalProgress(cumulativeStart + currentSceneTime);
                setCurrentTime(currentSceneTime);

                // Keep video synced with audio
                if (videoElement && Math.abs(videoElement.currentTime - audio.currentTime) > 0.1) {
                  videoElement.currentTime = audio.currentTime;
                }
              }
            }, 100);

            // Play both video and audio
            await Promise.all([videoElement.play(), audio.play()]);

            await new Promise<void>((resolve) => {
              const checkCancellation = () => {
                if (previewCancelledRef.current) {
                  videoElement.pause();
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
                videoElement.pause();
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };

              audio.onerror = () => {
                videoElement.pause();
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };

              checkCancellation();
            });
          } catch (err) {
            console.error("Video + Audio play error:", err);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        }
        return !previewCancelledRef.current;
      }

      // Handle video-only scenes (video with its own audio)
      if (scene?.video_url && videoElementsRef.current[sceneIndex]) {
        const videoElement = videoElementsRef.current[sceneIndex];
        if (videoElement) {
          videoElement.currentTime = startTime;
          videoElement.volume = volumeRef.current;
          videoElement.muted = false;

          const duration = videoElement.duration || scene.duration || 5;
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[sceneIndex];

          setSceneDuration(duration);
          setSceneProgress(startTime);
          setTotalProgress(cumulativeStart + startTime);
          setCurrentTime(startTime);

          try {
            // Start progress tracking
            progressIntervalRef.current = setInterval(() => {
              if (videoElement && !videoElement.paused) {
                const currentSceneTime = videoElement.currentTime;
                setSceneProgress(currentSceneTime);
                setTotalProgress(cumulativeStart + currentSceneTime);
                setCurrentTime(currentSceneTime);
              }
            }, 100);

            await videoElement.play();
            await new Promise<void>((resolve) => {
              videoElement.onended = () => {
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };
              videoElement.onerror = () => {
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };
            });
          } catch (err) {
            console.error("Video play error:", err);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        }
        return !previewCancelledRef.current;
      }

      // Handle audio-only scenes (AI-generated images)
      if (scene?.audio_url && preloadedAudio[sceneIndex]) {
        const currentVol = volumeRef.current;
        const audio = preloadedAudio[sceneIndex];
        audio.volume = currentVol;
        audio.currentTime = startTime;
        currentAudioRef.current = audio;

        const sceneStartTimes = getSceneStartTimes();
        const cumulativeStart = sceneStartTimes[sceneIndex];

        setSceneDuration(audio.duration);
        setSceneProgress(startTime);
        setTotalProgress(cumulativeStart + startTime);

        try {
          // Start progress tracking
          progressIntervalRef.current = setInterval(() => {
            if (audio && !audio.paused) {
              const currentSceneTime = audio.currentTime;
              setSceneProgress(currentSceneTime);
              setTotalProgress(cumulativeStart + currentSceneTime);
              setCurrentTime(currentSceneTime);
            }
          }, 100);

          await audio.play();
          await new Promise<void>((resolve) => {
            audio.onended = () => {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
              }
              // Don't reset progress here - it causes the previous scene image to flash
              // The next scene will set its own progress when it starts
              resolve();
            };
            audio.onerror = () => {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
              }
              resolve();
            };
          });
        } catch (err) {
          console.error("Audio play error:", err);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }
      } else {
        // No audio - use calculated duration from database
        const duration = scene.duration || 5; // Default to 5s if not set
        console.log(`⏱️ No audio for scene ${sceneIndex + 1}, using calculated duration: ${duration}s, starting at ${startTime.toFixed(1)}s`);

        const sceneStartTimes = getSceneStartTimes();
        const cumulativeStart = sceneStartTimes[sceneIndex];

        setSceneDuration(duration);
        setSceneProgress(startTime);
        setTotalProgress(cumulativeStart + startTime);
        setCurrentTime(startTime);

        // Track progress for captions and timeline
        const playStartTime = Date.now();
        const remainingDuration = duration - startTime;

        progressIntervalRef.current = setInterval(() => {
          if (previewCancelledRef.current) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
            return;
          }

          const elapsed = (Date.now() - playStartTime) / 1000;
          const currentSceneTime = Math.min(startTime + elapsed, duration);
          setSceneProgress(currentSceneTime);
          setTotalProgress(cumulativeStart + currentSceneTime);
          setCurrentTime(currentSceneTime);

          if (currentSceneTime >= duration) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        }, 100);

        // Wait for remaining duration to complete
        await new Promise<void>(resolve => {
          setTimeout(() => {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
            resolve();
          }, remainingDuration * 1000);
        });
      }

      return !previewCancelledRef.current;
    };

    try {
      // Play first scene from the specified time
      const shouldContinue = await playSceneFromTime(startSceneIndex, startSceneTime);
      if (!shouldContinue) return;

      // Continue with remaining scenes from the beginning
      for (let i = startSceneIndex + 1; i < scenes.length; i++) {
        const shouldContinue = await playSceneFromTime(i, 0);
        if (!shouldContinue) {
          console.log("🛑 Preview cancelled");
          return;
        }
      }

      console.log("🎬 Preview completed!");
      if (bgMusicAudioRef.current && !bgMusicAudioRef.current.paused) {
        bgMusicAudioRef.current.pause();
        console.log("🎵 Stopped background music at preview completion");
      }
    } catch (err) {
      console.error("❌ Preview error:", err);
    } finally {
      if (!previewCancelledRef.current) {
        setIsPlayingPreview(false);
        console.log("🛑 Preview stopped naturally");
      }
    }
  };

  const startVideoPreview = async () => {
    console.log("🎬 Starting video preview from scene:", selectedScene);

    // Capture current progress before stopping (in case user seeked while paused)
    const startFromTime = sceneProgress;
    console.log(`📍 Captured startFromTime: ${startFromTime.toFixed(2)}s from sceneProgress`);

    // Stop any existing preview first
    stopVideoPreview();

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));

    // Don't reset progress to 0 - preserve seeked position
    // (will be set by playScene or continuePreviewFromPosition)

    // Reset cancellation flag and start new preview
    previewCancelledRef.current = false;
    setIsPlayingPreview(true);

    // Start background music if enabled
    if (bgMusicEnabled && bgMusicUrl) {
      if (!bgMusicAudioRef.current || bgMusicAudioRef.current.src !== bgMusicUrl) {
        bgMusicAudioRef.current = new Audio(bgMusicUrl);
        bgMusicAudioRef.current.loop = false; // Don't loop - stop when video ends
      }
      // Apply background music volume directly (matches generated video)
      bgMusicAudioRef.current.volume = bgMusicVolume / 100;
      bgMusicAudioRef.current.currentTime = 0;
      bgMusicAudioRef.current.play().catch(err => {
        console.error("Failed to play background music in preview:", err);
      });
    }
    
    const playScene = async (sceneIndex: number) => {
      if (previewCancelledRef.current) return false;

      console.log(`🎬 Playing scene ${sceneIndex + 1}`);

      // Wait for next animation frame to ensure clean transition
      await new Promise(resolve => requestAnimationFrame(() => resolve(void 0)));

      if (previewCancelledRef.current) return false;

      setSelectedScene(sceneIndex);

      const scene = scenes[sceneIndex];

      // If scene has uploaded video AND separate audio, play video muted + sync with audio
      if (scene?.video_url && scene?.audio_url && videoElementsRef.current[sceneIndex] && preloadedAudio[sceneIndex]) {
        const videoElement = videoElementsRef.current[sceneIndex];
        const audio = preloadedAudio[sceneIndex];

        if (videoElement && audio) {
          console.log(`🎥🔊 Playing video (muted) with separate audio narration for scene ${sceneIndex + 1}`);

          // Reset both video and audio
          videoElement.currentTime = 0;
          videoElement.muted = true; // Mute video audio
          audio.currentTime = 0;
          audio.volume = volumeRef.current;

          // Set scene duration from audio (should match video duration after generation)
          const duration = audio.duration || scene.duration || 5;
          setSceneDuration(duration);
          setSceneProgress(0);
          currentAudioRef.current = audio;

          // Calculate cumulative start time
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[sceneIndex];

          try {
            // Start progress tracking
            progressIntervalRef.current = setInterval(() => {
              if (audio && !audio.paused) {
                const currentSceneTime = audio.currentTime;
                setSceneProgress(currentSceneTime);
                setTotalProgress(cumulativeStart + currentSceneTime);
                setCurrentTime(currentSceneTime);

                // Keep video synced with audio
                if (videoElement && Math.abs(videoElement.currentTime - audio.currentTime) > 0.1) {
                  videoElement.currentTime = audio.currentTime;
                }
              }
            }, 100);

            // Play both video and audio together
            await Promise.all([videoElement.play(), audio.play()]);

            await new Promise<void>((resolve) => {
              const checkCancellation = () => {
                if (previewCancelledRef.current) {
                  videoElement.pause();
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
                videoElement.pause();
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };

              audio.onerror = () => {
                videoElement.pause();
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };

              checkCancellation();
            });
          } catch (err) {
            console.error("Video + Audio sync play error:", err);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        }
        return true;
      }

      // If scene has uploaded video only (no separate audio), play the video with its built-in audio
      if (scene?.video_url && videoElementsRef.current[sceneIndex]) {
        const videoElement = videoElementsRef.current[sceneIndex];
        if (videoElement) {
          console.log(`🎥 Playing uploaded video for scene ${sceneIndex + 1}`);
          videoElement.currentTime = 0;
          videoElement.volume = volumeRef.current;
          videoElement.muted = false;

          // Set scene duration from video
          const duration = videoElement.duration || scene.duration || 5;
          setSceneDuration(duration);
          setSceneProgress(0);

          // Calculate cumulative start time
          const sceneStartTimes = getSceneStartTimes();
          const cumulativeStart = sceneStartTimes[sceneIndex];

          try {
            // Start progress tracking for video
            progressIntervalRef.current = setInterval(() => {
              if (videoElement && !videoElement.paused) {
                const currentSceneTime = videoElement.currentTime;
                setSceneProgress(currentSceneTime);
                setTotalProgress(cumulativeStart + currentSceneTime);
                setCurrentTime(currentSceneTime);
              }
            }, 100);

            await videoElement.play();
            await new Promise<void>((resolve) => {
              const checkCancellation = () => {
                if (previewCancelledRef.current) {
                  videoElement.pause();
                  if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                  }
                  resolve();
                  return;
                }
                setTimeout(checkCancellation, 100);
              };

              videoElement.onended = () => {
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };
              videoElement.onerror = () => {
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current);
                }
                resolve();
              };

              checkCancellation();
            });
          } catch (err) {
            console.error("Video play error:", err);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        }
        return true;
      }

      // Otherwise, play audio-only scenes (AI-generated images with separate audio)
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
              // Don't reset progress here - it causes the previous scene image to flash
              // The next scene will set its own progress when it starts
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
        // No audio - use calculated duration from database
        const duration = scene.duration || 5; // Default to 5s if not set
        console.log(`⏱️ No audio for scene ${sceneIndex + 1}, using calculated duration: ${duration}s`);

        // Set scene duration for UI
        setSceneDuration(duration);
        setSceneProgress(0);

        // Calculate cumulative start time for this scene
        const sceneStartTimes = getSceneStartTimes();
        const cumulativeStart = sceneStartTimes[sceneIndex];
        setTotalProgress(cumulativeStart);

        // Track progress for captions and timeline
        const startTime = Date.now();
        progressIntervalRef.current = setInterval(() => {
          if (previewCancelledRef.current) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
            return;
          }

          const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds
          const currentSceneTime = Math.min(elapsed, duration);
          setSceneProgress(currentSceneTime);
          setTotalProgress(cumulativeStart + currentSceneTime);
          setCurrentTime(currentSceneTime); // For word-by-word captions

          if (currentSceneTime >= duration) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        }, 100);

        // Wait for duration to complete
        await new Promise<void>(resolve => {
          setTimeout(() => {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
            resolve();
          }, duration * 1000);
        });
      }
      
      return !previewCancelledRef.current;
    };
    
    try {
      // If user seeked while paused, start from that position
      if (startFromTime > 0) {
        console.log(`▶️ Resuming from seeked position: ${startFromTime.toFixed(1)}s`);
        await continuePreviewFromPosition(selectedScene, startFromTime);
      } else {
        // Normal flow - play scenes starting from selected scene
        for (let i = selectedScene; i < scenes.length; i++) {
          const shouldContinue = await playScene(i);
          if (!shouldContinue) {
            console.log("🛑 Preview cancelled");
            return;
          }
        }
      }

      console.log("🎬 Preview completed!");

      // Stop background music when preview completes
      if (bgMusicAudioRef.current && !bgMusicAudioRef.current.paused) {
        bgMusicAudioRef.current.pause();
        console.log("🎵 Stopped background music at preview completion");
      }
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

    const hasAudio = !!scenes[sceneIndex].audio_url;
    const sceneId = scenes[sceneIndex].id;
    if (!sceneId) return; // Type guard: ensure sceneId exists

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/edit_scene", {
        method: "POST",
        headers,
        body: JSON.stringify({
          story_id: id,
          scene_id: sceneId,
          scene_order: sceneIndex,
          text: newText,
        }),
      });

      if (!res.ok) throw new Error("Failed to edit scene");

      // Update local state immediately
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        text: newText,
      };
      setScenes(updatedScenes);

      // Mark scene as modified
      const newModified = new Set(modifiedScenes);
      newModified.add(sceneIndex);
      setModifiedScenes(newModified);

      setEditingScene(null);
      setEditText("");
      setEditSceneDescription("");

      // If scene has audio, trigger async alignment in the background
      if (hasAudio && newText.trim().length > 0) {
        toast({
          title: "Scene saved!",
          description: "Aligning text with audio in the background...",
        });

        // Trigger alignment asynchronously (don't await)
        fetch("/api/align_scene_text", {
          method: "POST",
          headers,
          body: JSON.stringify({
            story_id: id,
            scene_id: sceneId,
          }),
        })
          .then(async (alignRes) => {
            if (alignRes.ok) {
              // Refresh scene to get new word timestamps (pass scene ID, not index)
              await fetchAndUpdateScene(sceneId);
              toast({
                title: "Alignment complete!",
                description: "Text synced with audio successfully",
              });
            } else {
              console.warn("Alignment failed, using synthetic timestamps");
            }
          })
          .catch((err) => {
            console.warn("Alignment error:", err);
          });
      }
    } catch (err) {
      console.error("Scene edit error:", err);
      toast({
        title: "Error",
        description: `Failed to edit scene: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };

  const updateSceneEffect = async (sceneIndex: number, effectId: EffectType) => {
    if (!scenes[sceneIndex]?.id) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/update_scene_effect", {
        method: "POST",
        headers,
        body: JSON.stringify({
          scene_id: scenes[sceneIndex].id,
          effect_id: effectId,
        }),
      });

      if (!res.ok) throw new Error("Failed to update effect");

      // Update local state immediately - preserve existing effects like overlay
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        effects: {
          ...updatedScenes[sceneIndex].effects,
          motion: effectId
        }
      };
      setScenes(updatedScenes);

      console.log(`✅ Effect updated for scene ${sceneIndex + 1}: ${effectId}`);
    } catch (err) {
      console.error("Effect update error:", err);
      alert(`Failed to update effect: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const updateSceneOverlay = async (sceneIndex: number, overlayId: string | null, overlayUrl?: string) => {
    if (!scenes[sceneIndex]?.id) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/update_scene_effect", {
        method: "POST",
        headers,
        body: JSON.stringify({
          scene_id: scenes[sceneIndex].id,
          overlay_id: overlayId,
          overlay_url: overlayUrl || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update overlay");

      // Update local state immediately
      const updatedScenes = [...scenes];
      const newEffects: any = {
        ...updatedScenes[sceneIndex].effects,
      };

      if (overlayId === null) {
        delete newEffects.overlay_id;
        delete newEffects.overlay_url;
      } else {
        newEffects.overlay_id = overlayId;
        if (overlayUrl) {
          newEffects.overlay_url = overlayUrl;
        }
      }

      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        effects: newEffects
      };
      setScenes(updatedScenes);

      console.log(`✅ Overlay updated for scene ${sceneIndex + 1}: ${overlayId || 'none'}`);
    } catch (err) {
      console.error("Overlay update error:", err);
      alert(`Failed to update overlay: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const saveStoryTitle = async () => {
    if (!id || !editTitleText.trim()) return;

    setSavingTitle(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/update_story_title", {
        method: "POST",
        headers,
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

  const updateAspectRatio = async (newRatio: "9:16" | "16:9" | "1:1") => {
    if (!id) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/update_story", {
        method: "POST",
        headers,
        body: JSON.stringify({
          story_id: id,
          aspect_ratio: newRatio
        }),
      });

      if (!res.ok) throw new Error("Failed to update aspect ratio");

      // Update local state immediately
      setAspectRatio(newRatio);
      setStory({ ...story, aspect_ratio: newRatio });
      console.log(`✅ Updated story aspect ratio to: ${newRatio}`);
    } catch (err) {
      console.error("Aspect ratio update error:", err);
      alert(`Failed to update aspect ratio: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    setDeletingScene(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/delete_scene", {
        method: "POST",
        headers,
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
      setDeletingScene(false);

    } catch (err) {
      console.error("Scene delete error:", err);
      alert(`Failed to delete scene: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDeleteDialogOpen(false);
      setSceneToDelete(null);
      setDeletingScene(false);
    }
  };

  const handleAddScene = async () => {
    if (addScenePosition === null || !id) return;

    setAddingScene(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/add_scene", {
        method: "POST",
        headers,
        body: JSON.stringify({
          story_id: id,
          scene_text: newSceneText.trim(), // Can be empty string - useful for video uploads
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
          video_url: scene.video_url ? `${scene.video_url}?t=${timestamp}` : scene.video_url,
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
    setEditSceneDescription(""); // Scene descriptions no longer stored in DB
  };

  const cancelEditing = () => {
    setEditingScene(null);
    setEditText("");
    setEditSceneDescription("");
  };

  const generateSceneDescription = async () => {
    if (!editText.trim() || generatingDescription) return;

    setGeneratingDescription(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/generate_scene_description", {
        method: "POST",
        headers,
        body: JSON.stringify({
          narration: editText,
          style: imageStyle,
          instructions: imageInstructions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate description");
      }

      const data = await response.json();

      if (data.description) {
        setEditSceneDescription(data.description);
        toast({ description: "Scene description generated successfully" });
      } else {
        throw new Error("No description returned");
      }
    } catch (err) {
      console.error("Error generating description:", err);
      toast({ description: "Failed to generate description with AI", variant: "destructive" });
    } finally {
      setGeneratingDescription(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-orange-600 mx-auto mb-4" />
          <p className="text-lg text-gray-700 font-medium">Loading your magical story...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="flex flex-col h-screen bg-black">
      {/* Top Header */}
      <header className="bg-black border-b border-gray-800">
        <div className="px-3 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2 md:gap-6">
          {/* Left side: Logo + Title + Back Link */}
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            {/* Logo placeholder - Hidden on mobile */}
            <div className="flex-shrink-0 hidden md:block">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-base">
                K
              </div>
            </div>

            {/* Title + Back Link (vertical stack) */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editTitleText}
                    onChange={(e) => setEditTitleText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveStoryTitle();
                      if (e.key === 'Escape') cancelEditingTitle();
                    }}
                    className="flex-1 text-base font-semibold text-white bg-gray-800 border border-gray-700 rounded px-3 py-1.5 focus:outline-none focus:border-orange-500"
                    maxLength={64}
                    autoFocus
                    disabled={savingTitle}
                    placeholder="Enter story title"
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
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm md:text-lg font-semibold text-white truncate">
                      {story?.title || "Video Editor"}
                    </h1>
                    <button
                      onClick={() => {
                        // On mobile: open settings dialog
                        // On desktop: inline edit
                        if (window.innerWidth < 768) {
                          setMobileSettingsDialogOpen(true);
                        } else {
                          startEditingTitle();
                        }
                      }}
                      className="p-1.5 md:p-2 bg-gray-800 hover:bg-orange-600 text-gray-400 hover:text-white rounded transition-colors flex-shrink-0"
                    >
                      <Pencil className="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      // If story belongs to a series, go back to series page
                      if (story?.series_id) {
                        router.push(`/series/${story.series_id}`);
                      } else {
                        router.push("/");
                      }
                    }}
                    className="text-xs text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1 w-fit"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span className="hidden sm:inline">
                      {story?.series_id ? "Back to Series" : "Back to All Stories"}
                    </span>
                    <span className="sm:hidden">Back</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right side: Controls - Compact on mobile */}
          <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
            {/* Desktop: Story Default Voice Selector */}
            <div className="hidden md:block">
            <Popover open={storyVoicePopoverOpen} onOpenChange={setStoryVoicePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white px-2 md:px-3"
                >
                  <Volume2 className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                  <span className="hidden md:inline text-xs md:text-sm">{voices.find(v => v.id === (story?.voice_id || "alloy"))?.name || "Select Voice"}</span>
                  <ChevronDown className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 opacity-50" />
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
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                      </div>
                    ) : voices.length > 0 ? (
                      voices.map((voice) => (
                        <div
                          key={voice.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                            (story?.voice_id || "alloy") === voice.id
                              ? "bg-orange-900/30"
                              : "hover:bg-gray-800"
                          }`}
                        >
                          <button
                            onClick={() => openVoiceUpdateConfirm(voice.id)}
                            className="flex-1 text-left min-w-0 flex items-center justify-between"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white">{voice.name}</div>
                              {voice.labels && formatVoiceLabels(voice.labels) && (
                                <div className="text-xs text-gray-500 truncate">
                                  {formatVoiceLabels(voice.labels)}
                                </div>
                              )}
                            </div>
                            {(story?.voice_id || "alloy") === voice.id && (
                              <Check className="w-4 h-4 text-orange-400 flex-shrink-0 ml-2" />
                            )}
                          </button>
                          {voice.preview_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoicePreview(voice.id, voice.preview_url);
                              }}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 w-16 ${
                                playingPreviewId === voice.id
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                              }`}
                            >
                              {playingPreviewId === voice.id ? 'Stop' : 'Preview'}
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">No voices available</div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            </div>

            {/* Voice Update Confirmation Dialog */}
            <AlertDialog open={voiceUpdateConfirmOpen} onOpenChange={setVoiceUpdateConfirmOpen}>
              <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Update Story Default Voice?</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400 space-y-2">
                    <span>Change story default voice to <span className="font-semibold text-orange-400">{pendingVoiceName}</span>?</span>
                    <span className="block">All new scenes will use this voice by default. Existing scenes will keep their current voice unless regenerated.</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={updateStoryVoice}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    Update Voice
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Reusable Credit Confirmation Dialog */}
            <AlertDialog open={creditConfirmOpen} onOpenChange={setCreditConfirmOpen}>
              <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>{creditConfirmAction?.title}</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    {creditConfirmAction?.message}
                  </AlertDialogDescription>
                  <div className="flex items-center justify-center gap-2 bg-orange-900/30 border border-orange-600/50 rounded-lg p-4 mt-4">
                    <Coins className="w-5 h-5 text-orange-400" />
                    <span className="text-lg font-bold text-orange-400">
                      This action will cost you {creditConfirmAction?.credits} {creditConfirmAction?.credits === 1 ? 'credit' : 'credits'}
                    </span>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      creditConfirmAction?.onConfirm();
                      setCreditConfirmOpen(false);
                      setCreditConfirmAction(null);
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Stuck Job Dialog */}
            <AlertDialog open={stuckJobDialogOpen} onOpenChange={setStuckJobDialogOpen}>
              <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Video Generation Job running in Background</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    Do you want to kill the Video Generation in Progress?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white"
                    disabled={clearingStuckJob}
                  >
                    No
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      clearStuckJob();
                    }}
                    disabled={clearingStuckJob}
                    className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
                  >
                    {clearingStuckJob ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Stopping...
                      </>
                    ) : (
                      'Yes'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Image Generation In Progress Dialog */}
            <AlertDialog open={stuckImageJobDialogOpen} onOpenChange={setStuckImageJobDialogOpen}>
              <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Image Generation In Progress</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    An image generation job is already running for this story. Would you like to cancel the current job and start a new one, or wait for it to finish?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white"
                    disabled={clearingImageJob}
                  >
                    Wait
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      clearImageJob();
                    }}
                    disabled={clearingImageJob}
                    className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
                  >
                    {clearingImageJob ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      'Cancel & Restart'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Desktop: Aspect Ratio Selector */}
            <div className="hidden md:block">
            <Popover open={aspectRatioPopoverOpen} onOpenChange={setAspectRatioPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white px-2 md:px-3"
                >
                  <Maximize className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                  <span className="hidden md:inline">
                    {aspectRatio === "9:16" && "9:16"}
                    {aspectRatio === "16:9" && "16:9"}
                    {aspectRatio === "1:1" && "1:1"}
                  </span>
                  <ChevronDown className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 opacity-50" />
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
                        updateAspectRatio("9:16");
                        setAspectRatioPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                        aspectRatio === "9:16"
                          ? "bg-orange-900/30 text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>9:16 (Portrait)</span>
                      {aspectRatio === "9:16" && (
                        <Check className="w-4 h-4 text-orange-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        updateAspectRatio("16:9");
                        setAspectRatioPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                        aspectRatio === "16:9"
                          ? "bg-orange-900/30 text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>16:9 (Landscape)</span>
                      {aspectRatio === "16:9" && (
                        <Check className="w-4 h-4 text-orange-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        updateAspectRatio("1:1");
                        setAspectRatioPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                        aspectRatio === "1:1"
                          ? "bg-orange-900/30 text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>1:1 (Square)</span>
                      {aspectRatio === "1:1" && (
                        <Check className="w-4 h-4 text-orange-400" />
                      )}
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            </div>

            {/* Credit Balance Display */}
            <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-gray-800 border border-gray-700 rounded-lg">
              <Coins className="w-3 h-3 md:w-4 md:h-4 text-orange-400" />
              <span className="text-xs md:text-sm font-semibold text-white">
                {creditBalance}
              </span>
              <span className="hidden md:inline text-xs text-gray-400">
                credits
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Left Sidebar - Tool Icons (Bottom on mobile, Left on tablets/desktop) */}
        <aside className="md:w-20 bg-black border-t md:border-t-0 md:border-r border-gray-800 flex md:flex-col items-center py-2 md:py-6 gap-4 md:gap-6 order-last md:order-first justify-around md:justify-start flex-shrink-0">
          {/* Scenes/Frames Icon */}
          <button
            data-tour="scenes-tab"
            onClick={() => {
              setLeftPanelView("scenes");
              setMobileView("timeline");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "scenes" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Scenes"
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-[10px] mt-1">Scenes</span>
          </button>

          {/* Captions Icon */}
          <button
            data-tour="captions-tab"
            onClick={() => {
              setLeftPanelView("captions");
              setMobileView("timeline");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "captions" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Captions"
          >
            <Type className="w-5 h-5" />
            <span className="text-[10px] mt-1">Captions</span>
          </button>

          {/* Background Music Icon */}
          <button
            data-tour="music-tab"
            onClick={() => {
              setLeftPanelView("background_music");
              setMobileView("timeline");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "background_music" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Background Music"
          >
            <Music className="w-5 h-5" />
            <span className="text-[10px] mt-1">Music</span>
            {bgMusicEnabled && bgMusicUrl && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500"></div>
            )}
          </button>

          {/* Preview Icon - Mobile only */}
          <button
            data-tour="preview-button-mobile"
            className={`md:hidden w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "preview" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => {
              setLeftPanelView("preview");
              setMobileView("preview");
            }}
            title="Preview"
          >
            <Play className="w-5 h-5" />
            <span className="text-[10px] mt-1">Preview</span>
          </button>

          {/* Help Icon */}
          <button
            onClick={() => {
              setLeftPanelView("help");
              setMobileView("timeline");
            }}
            className={`w-10 h-10 flex flex-col items-center justify-center transition-colors ${
              leftPanelView === "help" ? "text-orange-400 bg-orange-900/20" : "text-gray-400 hover:text-white"
            }`}
            title="Help & Support"
          >
            <HelpCircle className="w-5 h-5" />
            <span className="text-[10px] mt-1">Help</span>
          </button>
        </aside>

        {/* Main Content - Toggle on mobile, Side by Side on tablets/desktop */}
        <main className="flex-1 flex bg-black overflow-hidden relative min-h-0">
          {/* Left Timeline Section - Toggleable on mobile, 50% on tablets/desktop */}
          <div className={`${mobileView === 'timeline' ? 'flex' : 'hidden'} md:flex md:w-[50%] border-r border-gray-800 bg-black flex-col w-full min-h-0`}>
            {leftPanelView === "scenes" ? (
              /* Scenes Timeline View */
                <div className="relative flex flex-col flex-1 overflow-hidden">
                  {/* Scenes List */}
                  <div className="px-3 md:px-10 py-3 space-y-3 flex-1 overflow-y-auto">
                    {scenes.map((scene, index) => (
                <div key={`scene-wrapper-${scene.id}-${scene.image_url || 'no-image'}`}>
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
                  data-tour={index === 0 ? "scene-tile" : undefined}
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
                  <div className="p-2.5 lg:p-3 flex flex-col">
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
                          #{index + 1}
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
                          <div className="text-orange-500 text-xs font-medium">
                            Scene Narration
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
                            <div>
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                                rows={5}
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  editScene(index, editText);
                                }}
                                disabled={!editText.trim()}
                                className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Check className="w-3 h-3" />
                                Save
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingScene(null);
                                  setEditText("");
                                  setEditSceneDescription("");
                                }}
                                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 mb-2">
                            {/* Narration Text */}
                            <div className="text-gray-400 text-xs line-clamp-5">
                              {scene.text}
                            </div>

                            {/* Scene Description hidden per user request */}
                          </div>
                        )}
                        <div className="text-gray-500 text-xs mt-auto flex items-center gap-1">
                          <span>⏱️</span> {scene.duration ? `${Math.round(scene.duration)}s` : '--'}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-1.5 lg:gap-2 pt-3 border-t border-gray-800">
                      <div className="flex gap-1.5 lg:gap-2">
                        {/* Audio Button - Always show */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {scene.audio_url ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAudioDrawer(index);
                                }}
                                disabled={generatingSceneAudio.has(index)}
                                className={`px-2 lg:px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50 ${
                                  isAudioOutdated(scene)
                                    ? 'bg-yellow-900/50 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-400'
                                    : 'bg-green-800 hover:bg-green-700 text-white'
                                }`}
                              >
                                {generatingSceneAudio.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-[10px] lg:text-xs">Audio...</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span className="text-[10px] lg:text-xs">Audio</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAudioDrawer(index);
                                }}
                                disabled={generatingSceneAudio.has(index)}
                                className="px-2 lg:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50"
                              >
                                {generatingSceneAudio.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-[10px] lg:text-xs">Audio...</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span className="text-[10px] lg:text-xs">Audio</span>
                                  </>
                                )}
                              </button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getAudioButtonTooltip(scene)}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Image Button - Only show if no video and not uploading video */}
                        {!scene.video_url && !uploadingSceneVideo.has(index) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {scene.image_url ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openImageDrawer(index);
                                  }}
                                  disabled={generatingSceneImage.has(index)}
                                  className={`px-2 lg:px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50 ${
                                    isImageOutdated(scene)
                                      ? 'bg-yellow-900/50 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-400'
                                      : 'bg-green-800 hover:bg-green-700 text-white'
                                  }`}
                                >
                                  {generatingSceneImage.has(index) ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span className="text-[10px] lg:text-xs">Gen...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="w-3 h-3" />
                                      <span className="text-[10px] lg:text-xs">Image</span>
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
                                  className="px-2 lg:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50"
                                >
                                  {generatingSceneImage.has(index) ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span className="text-[10px] lg:text-xs">Gen...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3 h-3" />
                                      <span className="text-[10px] lg:text-xs">Image</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{getImageButtonTooltip(scene)}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Video Button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {scene.video_url ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast({
                                    title: "Video Uploaded",
                                    description: "Video is ready for final generation",
                                  });
                                }}
                                disabled={uploadingSceneVideo.has(index)}
                                className="px-2 lg:px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50 bg-green-800 hover:bg-green-700 text-white"
                              >
                                {uploadingSceneVideo.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-[10px] lg:text-xs">Video</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span className="text-[10px] lg:text-xs">Video</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openVideoUpload(index);
                                }}
                                disabled={uploadingSceneVideo.has(index)}
                                className="px-2 lg:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50"
                              >
                                {uploadingSceneVideo.has(index) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-[10px] lg:text-xs">Video</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span className="text-[10px] lg:text-xs">Video</span>
                                  </>
                                )}
                              </button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{scene.video_url ? 'Video uploaded and ready' : 'Upload a video for this scene'}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Effect Button - Icon Only (only show for AI-generated images, not uploaded videos) */}
                        {scene.image_url && !scene.video_url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEffectScene(index);
                                  setEffectModalOpen(true);
                                }}
                                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Add video effect ({scene.effects?.motion || 'none'})</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Overlay Button - Icon Only (only show for AI-generated images, not uploaded videos) */}
                        {scene.image_url && !scene.video_url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOverlayScene(index);
                                  setOverlayModalOpen(true);
                                }}
                                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                              >
                                <Layers className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Add overlay effect ({(scene.effects as any)?.overlay_id ? 'selected' : 'none'})</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {/* Edit Button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingScene(index);
                                setEditText(scene.text);
                                setEditSceneDescription("");
                                if (window.innerWidth < 768) {
                                  setMobileEditDialogOpen(true);
                                }
                              }}
                              className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit scene</p>
                          </TooltipContent>
                        </Tooltip>
                        {/* Delete Button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSceneToDelete(index);
                                setDeleteDialogOpen(true);
                              }}
                              className="p-1.5 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete scene</p>
                          </TooltipContent>
                        </Tooltip>
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
                  </div>

              {/* Bulk Actions */}
              <div className="sticky bottom-0 bg-black pb-3">
                <div className="border-t-2 border-gray-500"></div>
                <div className="px-3 md:px-6 flex gap-3 pt-4">
                  <button
                    data-tour="generate-images-button"
                    onClick={() => setBulkImageDrawerOpen(true)}
                    disabled={generatingImages}
                    className="flex-1 flex items-center justify-center gap-2 h-9 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
                  >
                    {generatingImages ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Image className="w-4 h-4" />
                        Images
                        <span className="ml-2 px-2 py-0.5 bg-white/10 rounded-full text-xs font-semibold flex items-center gap-1">
                          <Coins className="w-3 h-3" />
                          {scenes.length * CREDIT_COSTS.IMAGE_PER_SCENE}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    data-tour="generate-audio-button"
                    onClick={() => setBulkAudioDrawerOpen(true)}
                    disabled={generatingAudios}
                    className="flex-1 flex items-center justify-center gap-2 h-9 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
                  >
                    {generatingAudios ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        Audio
                        <span className="ml-2 px-2 py-0.5 bg-white/10 rounded-full text-xs font-semibold flex items-center gap-1">
                          <Coins className="w-3 h-3" />
                          {scenes.length * CREDIT_COSTS.AUDIO_PER_SCENE}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
                </div>
            ) : leftPanelView === "captions" ? (
              /* Captions Settings View */
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
              /* Background Music Settings View */
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
                          // Apply background music volume directly (matches generated video)
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
                          formData.append("name", file.name.replace(/\.[^/.]+$/, "")); // Remove extension
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

                            // Add the new music to the library immediately
                            if (data.music) {
                              setMusicLibrary(prev => [data.music, ...prev]);

                              // Auto-select the newly uploaded music
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

                    {/* Import from URL Button */}
                    <button
                      onClick={() => setImportUrlDialog(true)}
                      disabled={importing}
                      className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center transition-colors hover:border-gray-600 disabled:opacity-50"
                    >
                      <Download className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-xs font-medium text-white leading-tight">Import from URL</p>
                    </button>

                    {/* Import from YouTube Button */}
                    <button
                      onClick={() => setImportYoutubeDialog(true)}
                      disabled={importing}
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

                          {/* Delete Button - Only for user's uploads (not presets) - Show on hover */}
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
            ) : leftPanelView === "help" ? (
              /* Help & Support View */
              <div className="flex-1 overflow-y-auto p-3 md:p-6 pb-20">
                {/* Breadcrumb Navigation */}
                <div className="mb-6 flex items-center gap-2 text-sm">
                  <button
                    onClick={() => {
                      setSelectedHelpArticle(null);
                      setSelectedHelpCategory(null);
                      setHelpSearchQuery('');
                    }}
                    className="text-gray-400 hover:text-orange-500 transition-colors font-medium"
                  >
                    Help & Support
                  </button>
                  {selectedHelpCategory && (
                    <>
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                      <button
                        onClick={() => {
                          setSelectedHelpArticle(null);
                        }}
                        className="text-gray-400 hover:text-orange-500 transition-colors font-medium"
                      >
                        {categories.find(c => c.id === selectedHelpCategory)?.name}
                      </button>
                    </>
                  )}
                  {selectedHelpArticle && (
                    <>
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                      <span className="text-white font-medium">{selectedHelpArticle.title}</span>
                    </>
                  )}
                </div>

                {selectedHelpArticle ? (
                  // Article View
                  <div>
                    <article className="prose prose-lg dark:prose-invert max-w-none bg-gray-900/50 rounded-xl p-8">
                      {selectedHelpArticle.content.split('\n').map((line, idx) => {
                        if (line.trim() === '') return <div key={idx} className="h-4" />;
                        if (line.startsWith('# ')) return <h1 key={idx} className="text-3xl font-bold text-white mt-8 mb-4 first:mt-0">{line.substring(2)}</h1>;
                        if (line.startsWith('## ')) return <h2 key={idx} className="text-2xl font-semibold text-white mt-8 mb-4 first:mt-0 pb-2 border-b border-gray-800">{line.substring(3)}</h2>;
                        if (line.startsWith('### ')) return <h3 key={idx} className="text-xl font-semibold text-orange-400 mt-6 mb-3 first:mt-0">{line.substring(4)}</h3>;
                        if (line.match(/^\d+\.\s/)) {
                          const text = line.replace(/^\d+\.\s/, '');
                          const number = line.match(/^(\d+)\./)?.[1];
                          return <div key={idx} className="flex gap-3 mb-3 items-start"><span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-sm font-semibold flex items-center justify-center">{number}</span><span className="flex-1 text-gray-300 pt-0.5">{text}</span></div>;
                        }
                        if (line.startsWith('- ')) return <div key={idx} className="flex gap-3 mb-2 items-start"><span className="text-orange-500 text-lg leading-6 font-bold">•</span><span className="flex-1 text-gray-300">{line.substring(2)}</span></div>;
                        if (line.match(/^(✅|❌|⚠️|💡|⭐|🎯|📝|🔧) /)) {
                          return <div key={idx} className="flex gap-3 mb-2 items-start"><span className="text-xl leading-6">{line[0]}</span><span className="flex-1 text-gray-300">{line.substring(2)}</span></div>;
                        }
                        return <p key={idx} className="text-gray-300 leading-relaxed mb-4 text-base" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>') }} />;
                      })}
                    </article>
                  </div>
                ) : (
                  // Browse View
                  <div>
                    {/* Search Bar */}
                    <div className="mb-8">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <Input
                          type="text"
                          placeholder="Search for help articles..."
                          value={helpSearchQuery}
                          onChange={(e) => setHelpSearchQuery(e.target.value)}
                          className="pl-12 pr-4 py-6 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-orange-500 rounded-xl text-base"
                        />
                      </div>
                      {(helpSearchQuery || selectedHelpCategory) && (
                        <button onClick={() => { setHelpSearchQuery(''); setSelectedHelpCategory(null); }} className="text-sm text-gray-500 hover:text-white mt-3 font-medium">
                          Clear filters
                        </button>
                      )}
                    </div>

                    {/* Product Tour CTA */}
                    {!helpSearchQuery && !selectedHelpCategory && (
                      <div className="mb-8 p-6 bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-600/30 rounded-xl">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-lg bg-orange-600 flex items-center justify-center flex-shrink-0">
                            <Play className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white mb-2">New to the Video Editor?</h3>
                            <p className="text-gray-400 text-sm mb-4">
                              Take a quick guided tour to learn how to create amazing videos with images, audio, and effects.
                              It only takes a minute!
                            </p>
                            <Button
                              onClick={() => setRunTour(true)}
                              className="bg-orange-600 hover:bg-orange-700 text-white"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Take Product Tour
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Category Grid */}
                    {!helpSearchQuery && !selectedHelpCategory && (
                      <div className="mb-8">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Browse by Category</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
                          {categories.map(cat => (
                            <button key={cat.id} onClick={() => setSelectedHelpCategory(cat.id)} className="flex items-center justify-between p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-orange-500 rounded-xl transition-all text-left group">
                              <span className="text-white font-medium">{cat.name}</span>
                              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Articles List */}
                    {(helpSearchQuery || selectedHelpCategory) && (
                      <div>
                        {selectedHelpCategory && <div className="mb-4"><h3 className="text-lg font-semibold text-white">{categories.find(c => c.id === selectedHelpCategory)?.name}</h3></div>}
                        <div className="grid grid-cols-1 gap-3">
                          {knowledgeBase.filter(article => {
                            if (selectedHelpCategory && article.category !== selectedHelpCategory) return false;
                            if (helpSearchQuery) {
                              const q = helpSearchQuery.toLowerCase();
                              return article.title.toLowerCase().includes(q) || article.keywords.some(k => k.toLowerCase().includes(q)) || article.content.toLowerCase().includes(q);
                            }
                            return true;
                          }).map(article => (
                            <button key={article.id} onClick={() => setSelectedHelpArticle(article)} className="flex items-start justify-between p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl transition-all text-left group">
                              <div className="flex-1">
                                <h5 className="text-white font-medium mb-1 group-hover:text-orange-400 transition-colors">{article.title}</h5>
                                <p className="text-xs text-gray-500 line-clamp-2">{article.content.substring(0, 120)}...</p>
                              </div>
                              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-orange-400 transition-colors flex-shrink-0 ml-3 mt-1" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chat with Support Button */}
                    <div className="mt-8 p-6 bg-gradient-to-br from-orange-900/20 to-orange-800/10 border border-orange-900/30 rounded-xl">
                      <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-orange-400" />
                        Can't find what you need?
                      </h3>
                      <p className="text-gray-400 text-sm mb-4">Chat with our support team for personalized help</p>
                      <Button onClick={() => { if (typeof window !== 'undefined' && (window as any).Tawk_API) (window as any).Tawk_API.maximize(); }} className="bg-orange-600 hover:bg-orange-700 text-white">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Chat with Support
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Right Preview Section - Toggleable on mobile, 50% on tablets/desktop */}
          <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 md:w-[50%] bg-black w-full flex-col relative overflow-hidden`}>
            <div className="video-preview-container flex-1 flex items-center justify-center p-3 overflow-y-auto" data-tour="video-preview">
              {scenes[selectedScene]?.video_url || scenes[selectedScene]?.image_url ? (
                <div className="relative">
                  {/* Main Preview Container */}
                  <div
                    className="rounded-lg shadow-2xl overflow-hidden bg-black relative max-w-[90vw] md:max-w-none"
                    style={{
                      width: `${getPreviewDimensions().width}px`,
                      height: `${getPreviewDimensions().height}px`,
                    }}
                  >
                    {/* Render all scene videos/images but only show the selected one */}
                    {/* This prevents animation restart issues by mounting each media element once */}
                    {scenes.map((scene, index) => (
                      scene.video_url ? (
                        // User-uploaded video
                        <video
                          key={`scene-${index}-${scene.video_url}`}
                          ref={(el) => { videoElementsRef.current[index] = el; }}
                          src={scene.video_url}
                          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
                            index === selectedScene ? 'opacity-100' : 'opacity-0 pointer-events-none'
                          }`}
                          muted={volume === 0}
                          loop={false}
                          playsInline
                          preload="metadata"
                        />
                      ) : scene.image_url ? (
                        // AI-generated image
                        <img
                          key={`scene-${index}-${scene.image_url}`}
                          src={scene.image_url}
                          alt={`Scene ${index + 1} preview`}
                          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                            index === selectedScene ? 'opacity-100' : 'opacity-0 pointer-events-none'
                          } ${index === selectedScene ? getEffectAnimationClass(scene?.effects?.motion || "none") : ''}`}
                          style={{
                            transformOrigin: "center center",
                            animationDuration: `${scene?.duration || 5}s`,
                          }}
                          loading="eager"
                          decoding="async"
                        />
                      ) : null
                    ))}

                    {/* Overlay Effects */}
                    {scenes.map((scene, index) => {
                      const overlayUrl = (scene?.effects as any)?.overlay_url;
                      if (!overlayUrl) return null;

                      // Show raw overlay in preview (no effects applied)
                      let blendMode: string = 'screen';
                      let opacity = 1.0;

                      return (
                        <video
                          key={`overlay-${index}-${overlayUrl}`}
                          src={overlayUrl}
                          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
                            index === selectedScene ? 'opacity-100' : 'opacity-0'
                          } ${index === selectedScene ? getEffectAnimationClass(scene?.effects?.motion || "none") : ''}`}
                          style={{
                            mixBlendMode: blendMode as any,
                            opacity: index === selectedScene ? opacity : 0,
                            transformOrigin: "center center",
                            animationDuration: `${scene?.duration || 5}s`,
                          }}
                          muted
                          loop
                          playsInline
                          autoPlay
                        />
                      );
                    })}

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
                                text={scenes[selectedScene].text}
                              />
                            ) : (
                              <SimpleCaption text={scenes[selectedScene].text} style={baseStyle} />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Watermark Overlay - Floating */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        animation: 'float-watermark-x 83s ease-in-out infinite, float-watermark-y 97s ease-in-out infinite',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'Arial, sans-serif',
                          fontSize: '14px',
                          fontWeight: 300,
                          color: 'rgba(255, 255, 255, 0.4)',
                          textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        AiVideoGen.cc
                      </div>
                    </div>
                    <style jsx>{`
                      @keyframes float-watermark-x {
                        0% { right: 10%; }
                        20% { right: 70%; }
                        45% { right: 25%; }
                        70% { right: 60%; }
                        90% { right: 40%; }
                        100% { right: 10%; }
                      }
                      @keyframes float-watermark-y {
                        0% { bottom: 10%; }
                        25% { bottom: 80%; }
                        50% { bottom: 30%; }
                        75% { bottom: 75%; }
                        100% { bottom: 10%; }
                      }
                    `}</style>

                    {/* Video Controls Overlay */}
                    <div className="absolute inset-0 opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pb-3 pt-16">
                        {/* Progress Bar */}
                        {getTotalDuration() > 0 && (
                          <div className="px-4 pb-3 group/seek">
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
                        <div className="flex items-center justify-between px-4">
                          <div className="flex items-center gap-3">
                            {/* Play/Pause */}
                            <button
                              onClick={isPlayingPreview ? stopVideoPreview : startVideoPreview}
                              disabled={!mediaPreloaded}
                              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                              title={!mediaPreloaded ? "Loading audio..." : (isPlayingPreview ? "Pause" : "Play")}
                            >
                              {!mediaPreloaded ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                              ) : isPlayingPreview ? (
                                <Pause className="w-6 h-6 fill-current" />
                              ) : (
                                <Play className="w-6 h-6 fill-current" />
                              )}
                            </button>

                            {/* Volume Group - Shows slider on hover (desktop) or always (mobile) */}
                            <div className="flex items-center gap-1 group/volume">
                              <button
                                onClick={() => {
                                  if (volume === 0) {
                                    // Unmute - restores both narration and background music proportionally
                                    setVolume(lastVolume);
                                  } else {
                                    // Mute - sets both narration and background music to 0
                                    setLastVolume(volume);
                                    setVolume(0);
                                  }
                                }}
                                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white rounded touch-manipulation"
                              >
                                {volume === 0 ? (
                                  <VolumeX className="w-6 h-6" />
                                ) : (
                                  <Volume2 className="w-6 h-6" />
                                )}
                              </button>

                              <div className="overflow-hidden transition-all duration-200 w-16 md:w-0 md:group-hover/volume:w-16">
                                <div
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onTouchMove={(e) => e.stopPropagation()}
                                  onTouchEnd={(e) => e.stopPropagation()}
                                  className="touch-none"
                                >
                                  <Slider
                                    value={[volume]}
                                    max={1}
                                    step={0.01}
                                    onValueChange={(value) => {
                                      const newVolume = value[0];
                                      setVolume(newVolume);
                                      if (newVolume > 0) setLastVolume(newVolume);
                                      // Background music volume will be updated automatically via useEffect
                                    }}
                                  />
                                </div>
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
                              const element = document.querySelector('.video-preview-container') as any;
                              if (element) {
                                // Check if already in fullscreen
                                const isFullscreen = document.fullscreenElement ||
                                                    (document as any).webkitFullscreenElement ||
                                                    (document as any).mozFullScreenElement ||
                                                    (document as any).msFullscreenElement;

                                if (isFullscreen) {
                                  // Exit fullscreen
                                  if (document.exitFullscreen) {
                                    document.exitFullscreen();
                                  } else if ((document as any).webkitExitFullscreen) {
                                    (document as any).webkitExitFullscreen();
                                  } else if ((document as any).mozCancelFullScreen) {
                                    (document as any).mozCancelFullScreen();
                                  } else if ((document as any).msExitFullscreen) {
                                    (document as any).msExitFullscreen();
                                  }
                                } else {
                                  // Enter fullscreen with vendor prefixes for iOS Safari
                                  if (element.requestFullscreen) {
                                    element.requestFullscreen();
                                  } else if (element.webkitRequestFullscreen) {
                                    element.webkitRequestFullscreen();
                                  } else if (element.webkitEnterFullscreen) {
                                    element.webkitEnterFullscreen();
                                  } else if (element.mozRequestFullScreen) {
                                    element.mozRequestFullScreen();
                                  } else if (element.msRequestFullscreen) {
                                    element.msRequestFullscreen();
                                  }
                                }
                              }
                            }}
                            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white rounded touch-manipulation"
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

            {/* Video Action Buttons - Fixed at bottom */}
            <div className="sticky bottom-0 bg-black pb-3">
              <div className="border-t-2 border-gray-500"></div>
              <div className="px-3 md:px-6 flex gap-3 pt-4">
                {/* Generate Video Button - Always visible */}
                <div className="flex items-center flex-1">
                  <button
                    data-tour="export-button"
                    onClick={generateVideo}
                    disabled={generatingVideo}
                    className={`flex-1 flex items-center justify-center gap-2 h-9 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors ${generatingVideo ? 'rounded-r-none' : ''}`}
                  >
                    {generatingVideo ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {videoProgress > 0 ? `${videoProgress}%` : 'Starting...'}
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-4 h-4" />
                        Generate Video
                      </>
                    )}
                  </button>

                  {/* Dropdown menu when video is generating */}
                  {generatingVideo && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-9 bg-orange-600 hover:bg-orange-700 text-white border-l border-orange-700 rounded-l-none px-2 flex items-center justify-center">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                        <DropdownMenuItem
                          onClick={() => setStuckJobDialogOpen(true)}
                          className="text-white hover:bg-gray-800 cursor-pointer"
                        >
                          <X className="w-3 h-3 mr-2" />
                          Stop Video Generation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Download button with dropdown - Only show when video exists */}
                {video?.video_url && (
                  <div className="flex items-center flex-1">
                    <button
                      onClick={() => setDownloadConfirmOpen(true)}
                      disabled={downloadingVideo}
                      className="flex-1 flex items-center justify-center gap-2 h-9 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded rounded-r-none transition-colors"
                    >
                      {downloadingVideo ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download
                        </>
                      )}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-9 bg-orange-600 hover:bg-orange-700 text-white border-l border-orange-700 rounded-l-none px-2 flex items-center justify-center">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(video.video_url);
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
                          onClick={() => {
                            const urlWithTimestamp = `${video.video_url}${video.video_url.includes('?') ? '&' : '?'}t=${Date.now()}`;
                            window.open(urlWithTimestamp, '_blank');
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
                  disabled={deletingScene}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  disabled={deletingScene}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {deletingScene ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Scene
                    </>
                  )}
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
                  disabled={addingScene}
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
                    <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
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
                            ? 'bg-orange-900/30 border-l-4 border-l-purple-500'
                            : 'hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {selectedVoiceId === voice.id && (
                            <Check className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white">{voice.name}</div>
                            {voice.labels && formatVoiceLabels(voice.labels) && (
                              <div className="text-xs text-gray-500 truncate">
                                {formatVoiceLabels(voice.labels)}
                              </div>
                            )}
                          </div>
                        </div>
                        {voice.preview_url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playVoicePreview(voice.id, voice.preview_url);
                            }}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 w-16 ${
                              playingPreviewId === voice.id
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                            title="Preview voice"
                          >
                            {playingPreviewId === voice.id ? 'Stop' : 'Preview'}
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
                  onClick={() => {
                    // Stop any playing voice preview before showing confirmation
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);

                    if (audioDrawerScene !== null) {
                      const sceneToGenerate = audioDrawerScene;
                      const voiceToGenerate = selectedVoiceId;

                      setCreditConfirmAction({
                        title: "Generate Audio for This Scene?",
                        message: `Generate audio narration for scene ${sceneToGenerate + 1}.`,
                        credits: CREDIT_COSTS.AUDIO_PER_SCENE,
                        onConfirm: () => {
                          // Close audio drawer
                          setAudioDrawerOpen(false);

                          // Generate audio in background (sets loading state internally)
                          generateSceneAudio(sceneToGenerate, voiceToGenerate);
                        }
                      });
                      setCreditConfirmOpen(true);
                    }
                  }}
                  disabled={generatingSceneAudio.has(audioDrawerScene)}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
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
                <div className="mb-6 p-3 bg-gray-800 border border-gray-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Image className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-orange-300">
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
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
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
                  onClick={() => {
                    if (imageDrawerScene !== null) {
                      setCreditConfirmAction({
                        title: "Generate Image for This Scene?",
                        message: `Generate image for scene ${imageDrawerScene + 1}.`,
                        credits: CREDIT_COSTS.IMAGE_PER_SCENE,
                        onConfirm: () => {
                          // Close image drawer
                          setImageDrawerOpen(false);

                          // Generate image in background (sets loading state internally)
                          generateSceneImage(
                            imageDrawerScene,
                            undefined, // Don't pass style - will use existing scenes for consistency
                            imageInstructions
                          );
                        }
                      });
                      setCreditConfirmOpen(true);
                    }
                  }}
                  disabled={imageDrawerScene !== null && generatingSceneImage.has(imageDrawerScene)}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
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

      {/* Video Upload Drawer */}
      {videoDrawerOpen && videoDrawerScene !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setVideoDrawerOpen(false);
              setSelectedVideoFile(null);
              setVideoFileDuration(0);
              setYoutubeUrl('');
            }}
          />

          {/* Drawer Content */}
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all">
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Upload Video to Scene #{videoDrawerScene + 1}
                </h3>
                <button
                  onClick={() => {
                    setVideoDrawerOpen(false);
                    setSelectedVideoFile(null);
                    setVideoFileDuration(0);
                    setYoutubeUrl('');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Import Mode Tabs */}
              <div className="mb-4 flex gap-2 border-b border-gray-700">
                <button
                  onClick={() => setVideoImportMode('file')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    videoImportMode === 'file'
                      ? 'border-orange-600 text-orange-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload File
                </button>
                <button
                  onClick={() => setVideoImportMode('youtube')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    videoImportMode === 'youtube'
                      ? 'border-orange-600 text-orange-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <PlayCircle className="w-4 h-4 inline mr-2" />
                  YouTube URL
                </button>
              </div>

              {/* Info Box */}
              <div className="mb-4 p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Upload className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-orange-300">
                    {videoImportMode === 'file'
                      ? 'Upload your video and generate captions with precise word-level timing'
                      : 'Import video from YouTube URL and generate captions automatically'}
                  </div>
                </div>
              </div>

              {/* File Upload Mode */}
              {videoImportMode === 'file' && (
                <>
              {/* File Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Video File
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validate file size (200MB max)
                      if (file.size > 200 * 1024 * 1024) {
                        toast({
                          title: "File too large",
                          description: "Video must be under 200MB",
                          variant: "destructive"
                        });
                        return;
                      }
                      handleVideoFileSelected(file);
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-700 cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max 5 minutes, under 200MB
                </p>
              </div>

              {/* Selected File Info */}
              {selectedVideoFile && (
                <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <PlayCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {selectedVideoFile.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Size: {(selectedVideoFile.size / 1024 / 1024).toFixed(2)} MB
                        {loadingVideoDuration && (
                          <span className="ml-2">
                            <Loader2 className="w-3 h-3 inline animate-spin" /> Analyzing...
                          </span>
                        )}
                        {!loadingVideoDuration && videoFileDuration > 0 && (
                          <span className="ml-2">
                            Duration: {Math.ceil(videoFileDuration)} seconds ({Math.ceil(videoFileDuration / 60)} min)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Credit Cost Display */}
              {selectedVideoFile && !loadingVideoDuration && videoFileDuration > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-center gap-2 bg-orange-900/30 border border-orange-600/50 rounded-lg p-4">
                    <Coins className="w-5 h-5 text-orange-400" />
                    <span className="text-base font-bold text-orange-400">
                      This will cost you {calculateVideoUploadCost(videoFileDuration)} {calculateVideoUploadCost(videoFileDuration) === 1 ? 'credit' : 'credits'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    {Math.ceil(videoFileDuration / 60)} {Math.ceil(videoFileDuration / 60) === 1 ? 'minute' : 'minutes'} × 3 credits/min
                  </p>
                </div>
              )}

              {/* Warning if video too long */}
              {videoFileDuration > 300 && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-300">
                      Video is too long. Maximum duration is 5 minutes.
                    </div>
                  </div>
                </div>
              )}
                </>
              )}

              {/* YouTube URL Mode */}
              {videoImportMode === 'youtube' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    YouTube Video URL
                  </label>
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Max 5 minutes video. Video will be downloaded and transcribed.
                  </p>

                  {/* YouTube URL preview */}
                  {youtubeUrl && /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(youtubeUrl) && (
                    <div className="mt-3 p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
                      <div className="flex items-start gap-2">
                        <PlayCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-green-300">
                          Valid YouTube URL detected. Ready to import!
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warning for invalid URL */}
                  {youtubeUrl && !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(youtubeUrl) && (
                    <div className="mt-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                      <div className="flex items-start gap-2">
                        <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-red-300">
                          Please enter a valid YouTube URL
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setVideoDrawerOpen(false);
                    setSelectedVideoFile(null);
                    setVideoFileDuration(0);
                    setYoutubeUrl('');
                  }}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (videoDrawerScene === null) return;

                    // File upload mode
                    if (videoImportMode === 'file' && selectedVideoFile) {
                      const creditsNeeded = calculateVideoUploadCost(videoFileDuration);
                      const sceneToUpload = videoDrawerScene;
                      const fileToUpload = selectedVideoFile;

                      setCreditConfirmAction({
                        title: "Upload and Transcribe Video?",
                        message: `Upload video for scene ${sceneToUpload + 1}. The video will be transcribed using AI to extract speech and word-level timing for captions.`,
                        credits: creditsNeeded,
                        onConfirm: () => {
                          // Close video drawer
                          setVideoDrawerOpen(false);
                          setSelectedVideoFile(null);
                          setVideoFileDuration(0);
                          setYoutubeUrl('');

                          // Upload video
                          handleSceneVideoUpload(sceneToUpload, fileToUpload);
                        }
                      });
                      setCreditConfirmOpen(true);
                    }

                    // YouTube import mode
                    if (videoImportMode === 'youtube' && youtubeUrl) {
                      const sceneToImport = videoDrawerScene;
                      const urlToImport = youtubeUrl;

                      // For YouTube, we can't calculate credits upfront (don't know duration)
                      // Just show a warning that credits will be charged based on video duration
                      setCreditConfirmAction({
                        title: "Import YouTube Video?",
                        message: `Import video from YouTube for scene ${sceneToImport + 1}. Credits will be charged based on video duration (3 credits per minute, max 5 minutes). The video will be downloaded and transcribed automatically.`,
                        credits: 0, // We don't know the duration yet
                        onConfirm: () => {
                          // Close video drawer
                          setVideoDrawerOpen(false);
                          setSelectedVideoFile(null);
                          setVideoFileDuration(0);
                          setYoutubeUrl('');

                          // Import from YouTube
                          handleYouTubeVideoImport(sceneToImport, urlToImport);
                        }
                      });
                      setCreditConfirmOpen(true);
                    }
                  }}
                  disabled={
                    (videoImportMode === 'file' && (!selectedVideoFile || loadingVideoDuration || videoFileDuration === 0 || videoFileDuration > 300)) ||
                    (videoImportMode === 'youtube' && (!youtubeUrl || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(youtubeUrl))) ||
                    uploadingSceneVideo.has(videoDrawerScene)
                  }
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingSceneVideo.has(videoDrawerScene) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {videoImportMode === 'file' ? 'Uploading...' : 'Importing...'}
                    </>
                  ) : (
                    <>
                      {videoImportMode === 'file' ? (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Video
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Import from YouTube
                        </>
                      )}
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
                  <h2 className="text-xl font-semibold text-white">Generate Images for All Scenes</h2>
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

              {/* Admin Section - Load Sample Images */}
              {isAdmin && (
                <div className="mb-4 p-3 border-2 border-yellow-500/50 bg-yellow-900/10 rounded-lg">
                  <div className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    ADMIN ONLY
                  </div>
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
              )}

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
                    { id: "3d-animation", value: "3d pixar style animation, rendered", label: "3D Animation", visual: "🎭" },
                    { id: "cartoon", value: "cartoon illustration, bold outlines", label: "Cartoon", visual: "🎪" },
                    { id: "anime", value: "anime illustration, high quality", label: "Anime", visual: "🎌" },
                    { id: "comic-book", value: "comic book art style, bold lines, vibrant colors", label: "Comic Book", visual: "💥" },
                    { id: "pencil-sketch", value: "pencil sketch drawing, detailed shading", label: "Pencil Sketch", visual: "✏️" },
                    { id: "black-and-white", value: "black and white photography, film noir, high contrast", label: "Black & White", visual: "🎞️" },
                    { id: "oil-painting", value: "oil painting, brushstrokes, classical art", label: "Oil Painting", visual: "🖼️" },
                    { id: "watercolor", value: "watercolor painting, soft, artistic", label: "Watercolor", visual: "🎨" },
                    { id: "lego-brick", value: "lego brick style, colorful plastic blocks, toy building", label: "LEGO Brick", visual: "🧱" },
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
                          ? "border-orange-500 shadow-lg shadow-orange-500/20"
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
                          <div className="absolute top-2 right-2 bg-orange-500 rounded-full p-1 shadow-lg z-20">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <div className={`p-2 text-center ${
                        selectedImageStyle === style.value
                          ? "bg-orange-900/40 text-white"
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
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
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
                  onClick={() => {
                    const credits = scenes.length * CREDIT_COSTS.IMAGE_PER_SCENE;
                    setCreditConfirmAction({
                      title: "Generate Images for All Scenes?",
                      message: `Generate images for all ${scenes.length} scenes.`,
                      credits: credits,
                      onConfirm: async () => {
                        setBulkImageDrawerOpen(false);
                        await generateImages(selectedImageStyle, imageInstructions);
                      }
                    });
                    setCreditConfirmOpen(true);
                  }}
                  disabled={generatingImages}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {generatingImages ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {imageProgress.total > 0 ? `Processing ${imageProgress.current}/${imageProgress.total}...` : 'Starting...'}
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
                  <h2 className="text-xl font-semibold text-white">Generate Audio for All Scenes</h2>
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
                    <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
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
                            ? 'bg-orange-900/30 border-l-4 border-l-purple-500'
                            : 'hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {selectedVoiceId === voice.id && (
                            <Check className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white">{voice.name}</div>
                            {voice.labels && formatVoiceLabels(voice.labels) && (
                              <div className="text-xs text-gray-500 truncate">
                                {formatVoiceLabels(voice.labels)}
                              </div>
                            )}
                          </div>
                        </div>
                        {voice.preview_url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playVoicePreview(voice.id, voice.preview_url);
                            }}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 w-16 ${
                              playingPreviewId === voice.id
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                            title="Preview voice"
                          >
                            {playingPreviewId === voice.id ? 'Stop' : 'Preview'}
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
                  onClick={() => {
                    console.log("🔘 Generate All Audio button clicked");
                    console.log("  Current selectedVoiceId state:", selectedVoiceId);

                    // Stop any playing voice preview before showing confirmation
                    if (voicePreviewAudioRef.current) {
                      voicePreviewAudioRef.current.pause();
                      voicePreviewAudioRef.current = null;
                    }
                    setPlayingPreviewId(null);

                    const credits = scenes.length * CREDIT_COSTS.AUDIO_PER_SCENE;
                    setCreditConfirmAction({
                      title: "Generate Audio for All Scenes?",
                      message: `Generate audio narration for all ${scenes.length} scenes.`,
                      credits: credits,
                      onConfirm: async () => {
                        setBulkAudioDrawerOpen(false);
                        await generateAllAudio(selectedVoiceId);
                      }
                    });
                    setCreditConfirmOpen(true);
                  }}
                  disabled={generatingAudios}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {generatingAudios ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {audioProgress.total > 0 ? `Processing ${audioProgress.current}/${audioProgress.total}...` : 'Starting...'}
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
                  {/* Font Family */}
                  <div className="mb-6">
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

                  {/* Font Size */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Font Size: <span className="text-orange-400 font-bold">{captionFontSize}px</span>
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
                      Font Weight: <span className="text-orange-400 font-bold">{captionFontWeight}</span>
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
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
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

      {/* Overlay Selection Modal */}
      {selectedOverlayScene !== null && (
        <OverlaySelectionModal
          isOpen={overlayModalOpen}
          onClose={() => {
            setOverlayModalOpen(false);
            setSelectedOverlayScene(null);
          }}
          overlays={overlays}
          currentOverlayId={(scenes[selectedOverlayScene]?.effects as any)?.overlay_id || null}
          sceneImageUrl={scenes[selectedOverlayScene]?.image_url || ''}
          aspectRatio={aspectRatio}
          onSelectOverlay={(overlayId, overlayUrl) => {
            updateSceneOverlay(selectedOverlayScene, overlayId, overlayUrl);
          }}
        />
      )}

      {/* Video Generation Success Dialog */}
      {videoSuccessDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setVideoSuccessDialogOpen(false)}
          />

          {/* Dialog content */}
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full">
            <div className="p-6">
              {/* Close button */}
              <button
                onClick={() => setVideoSuccessDialogOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-white mb-4">
                  Video Generation Complete
                </h2>

                {/* Video info */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-sm text-gray-400">Duration</span>
                    <span className="text-sm font-medium text-white">{generatedVideoDuration.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-sm text-gray-400">Format</span>
                    <span className="text-sm font-medium text-white">{aspectRatio}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-400">Status</span>
                    <span className="text-sm font-medium text-green-400">Ready</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <Button
                  onClick={() => {
                    if (generatedVideoUrl) {
                      window.open(generatedVideoUrl, '_blank');
                    }
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </Button>
                <Button
                  onClick={async () => {
                    if (generatedVideoUrl) {
                      try {
                        // Fetch the video as a blob to force download
                        const response = await fetch(generatedVideoUrl);
                        const blob = await response.blob();
                        const blobUrl = URL.createObjectURL(blob);

                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = `${story?.title || 'story'}-${aspectRatio}.mp4`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        // Clean up the blob URL after a short delay
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                      } catch (error) {
                        console.error('Download failed:', error);
                        // Fallback: open in new tab
                        window.open(generatedVideoUrl, '_blank');
                      }
                    }
                  }}
                  variant="outline"
                  className="w-full border-gray-700 text-white hover:bg-gray-800"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Video
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Music Confirmation Dialog */}
      {deleteMusicDialog.open && deleteMusicDialog.music && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteMusicDialog({open: false, music: null})}
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
                  <h3 className="text-lg font-semibold text-white">Delete Music Track?</h3>
                  <p className="text-sm text-gray-400">{deleteMusicDialog.music.name}</p>
                </div>
              </div>

              {/* Warning Message */}
              <p className="text-gray-300 mb-4">
                Are you sure you want to delete this music track? <span className="font-semibold text-red-400">This action cannot be undone.</span>
              </p>

              {/* Music Preview */}
              <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <Music className="w-10 h-10 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{deleteMusicDialog.music.name}</p>
                    <p className="text-xs text-gray-400">
                      {deleteMusicDialog.music.category && deleteMusicDialog.music.category.charAt(0).toUpperCase() + deleteMusicDialog.music.category.slice(1)}
                      {deleteMusicDialog.music.duration && ` • ${Math.floor(deleteMusicDialog.music.duration / 60)}:${String(Math.round(deleteMusicDialog.music.duration % 60)).padStart(2, '0')}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Impact Warning */}
              <div className="mb-6 p-3 bg-orange-900/20 border border-orange-900/50 rounded">
                <p className="text-sm text-orange-400">
                  <strong>Warning:</strong> Any stories currently using this music will no longer be able to play it after deletion.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeleteMusicDialog({open: false, music: null})}
                  disabled={deletingMusic}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDeleteMusic}
                  disabled={deletingMusic}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {deletingMusic ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Music
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import from URL Dialog */}
      {importUrlDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setImportUrlDialog(false);
              setImportUrl("");
              setImportName("");
              setImportNotes("");
            }}
          />

          {/* Dialog Content */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-orange-900/30 rounded-full flex items-center justify-center">
                  <ExternalLink className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Import from URL</h3>
                  <p className="text-sm text-gray-400">Download music from a direct URL</p>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Music URL
                  </label>
                  <Input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://example.com/music.mp3"
                    className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Direct link to audio file (MP3, WAV, etc.)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Track Name
                  </label>
                  <Input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="My Background Music"
                    className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={importNotes}
                    onChange={(e) => setImportNotes(e.target.value)}
                    placeholder="License info, attribution, etc."
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Add license information or other notes</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportUrlDialog(false);
                    setImportUrl("");
                    setImportName("");
                    setImportNotes("");
                  }}
                  disabled={importing}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImportFromUrl}
                  disabled={importing || !importUrl || !importName}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Settings Dialog */}
      <Dialog open={mobileSettingsDialogOpen} onOpenChange={setMobileSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
          <DialogHeader>
            <DialogTitle>Story Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Title</label>
              <Input
                value={editTitleText || story?.title || ""}
                onChange={(e) => setEditTitleText(e.target.value)}
                onBlur={async () => {
                  if (editTitleText && editTitleText !== story?.title) {
                    setSavingTitle(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const headers: HeadersInit = session
                        ? { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }
                        : { "Content-Type": "application/json" };

                      const res = await fetch(`/api/update_story_title`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ id, title: editTitleText }),
                      });

                      if (res.ok) {
                        setStory((prev: any) => ({ ...prev, title: editTitleText }));
                        toast({ description: "Title updated successfully" });
                      }
                    } catch (error) {
                      console.error("Error updating title:", error);
                    } finally {
                      setSavingTitle(false);
                    }
                  }
                }}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Enter story title"
              />
            </div>

            {/* Voice Selector */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Default Voice</label>
              <select
                value={story?.voice_id || "alloy"}
                onChange={(e) => openVoiceUpdateConfirm(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-orange-500"
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => updateAspectRatio("9:16")}
                  className={`px-4 py-3 rounded border-2 transition-all ${
                    aspectRatio === "9:16"
                      ? "border-orange-600 bg-orange-900/30 text-orange-400"
                      : "border-gray-700 hover:border-gray-600 text-gray-400"
                  }`}
                >
                  9:16<br/><span className="text-xs">Portrait</span>
                </button>
                <button
                  onClick={() => updateAspectRatio("1:1")}
                  className={`px-4 py-3 rounded border-2 transition-all ${
                    aspectRatio === "1:1"
                      ? "border-orange-600 bg-orange-900/30 text-orange-400"
                      : "border-gray-700 hover:border-gray-600 text-gray-400"
                  }`}
                >
                  1:1<br/><span className="text-xs">Square</span>
                </button>
                <button
                  onClick={() => updateAspectRatio("16:9")}
                  className={`px-4 py-3 rounded border-2 transition-all ${
                    aspectRatio === "16:9"
                      ? "border-orange-600 bg-orange-900/30 text-orange-400"
                      : "border-gray-700 hover:border-gray-600 text-gray-400"
                  }`}
                >
                  16:9<br/><span className="text-xs">Landscape</span>
                </button>
              </div>
            </div>

            {/* Save Button - Mobile Only */}
            <div className="flex justify-end pt-4 border-t border-gray-800 md:hidden">
              <Button
                onClick={() => setMobileSettingsDialogOpen(false)}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Edit Scene Dialog */}
      <Dialog open={mobileEditDialogOpen} onOpenChange={(open) => {
        setMobileEditDialogOpen(open);
        if (!open) {
          setEditingScene(null);
          setEditText("");
        }
      }}>
        <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
          <DialogHeader>
            <DialogTitle>Edit Scene {editingScene !== null ? editingScene + 1 : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Scene Text</label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                rows={6}
                placeholder="Enter scene narration..."
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMobileEditDialogOpen(false);
                  setEditingScene(null);
                  setEditText("");
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingScene !== null) {
                    editScene(editingScene, editText);
                    setMobileEditDialogOpen(false);
                  }
                }}
                disabled={!editText.trim()}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from YouTube Dialog */}
      {importYoutubeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setImportYoutubeDialog(false);
              setImportUrl("");
              setImportName("");
              setImportNotes("");
            }}
          />

          {/* Dialog Content */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Import from YouTube</h3>
                  <p className="text-sm text-gray-400">Download audio from a YouTube video</p>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    YouTube URL
                  </label>
                  <Input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">YouTube video or shorts URL</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Track Name
                  </label>
                  <Input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="My Background Music"
                    className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={importNotes}
                    onChange={(e) => setImportNotes(e.target.value)}
                    placeholder="License info, attribution, etc."
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Add license information or other notes</p>
                </div>

                <div className="p-3 bg-yellow-900/20 border border-yellow-900/50 rounded">
                  <p className="text-xs text-yellow-400">
                    <strong>Note:</strong> Only use copyright-free or properly licensed music.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportYoutubeDialog(false);
                    setImportUrl("");
                    setImportName("");
                    setImportNotes("");
                  }}
                  disabled={importing}
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImportFromYoutube}
                  disabled={importing || !importUrl || !importName}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                      Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Tour */}
      <ProductTour
        run={runTour}
        mode="editor"
        onFinish={() => {
          setRunTour(false);
        }}
        onStepChange={(stepIndex) => {
          // Automatically switch to the appropriate tab for each tour step
          // Video editor tour steps:
          // 0: Welcome (body)
          // 1: Scenes tab button
          // 2: Scene tile - needs scenes view
          // 3: Generate images button - needs scenes view
          // 4: Generate audio button - needs scenes view
          // 5: Captions tab - switch to captions
          // 6: Music tab - switch to music
          // 7: Video preview
          // 8: Export button

          if (stepIndex >= 1 && stepIndex <= 4) {
            // Steps 1-4: ensure we're on scenes tab
            setLeftPanelView("scenes");
          } else if (stepIndex === 5) {
            // Step 5: switch to captions tab
            setLeftPanelView("captions");
          } else if (stepIndex === 6) {
            // Step 6: switch to music tab
            setLeftPanelView("background_music");
          }
        }}
      />

      {/* Download Confirmation Dialog */}
      <AlertDialog open={downloadConfirmOpen} onOpenChange={setDownloadConfirmOpen}>
        <AlertDialogContent className="bg-gray-900 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Download Video?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Your video will be downloaded to your device. Depending on the video size, this may take a few moments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 text-white hover:bg-gray-700 border-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDownloadVideo}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for video upload */}
      <input
        ref={videoFileInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoFileChange}
        style={{ display: 'none' }}
      />
    </div>
    </TooltipProvider>
  );
}
