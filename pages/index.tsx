import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, PlayCircle, Clock, Film, Image as ImageIcon, Video, User, LogOut, Trash2, MoreHorizontal, Smartphone, Square, Monitor, Coins, List, ArrowLeft, Menu, X, Sparkles, Volume2, Info, Play, StopCircle, HelpCircle, Search, ChevronRight, MessageCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LandingPage } from "@/components/LandingPage";
import { useCredits } from "../hooks/useCredits";
import { CREDIT_COSTS } from "@/lib/creditConstants";
import { toast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { knowledgeBase, categories, type KnowledgeArticle } from "@/lib/knowledgeBase";
import { ProductTour } from "@/components/ProductTour";

type Story = {
  id: string;
  title: string | null;
  prompt: string;
  created_at: string;
  status: string;
  first_scene_image: string | null;
  scene_count: number;
  video_duration: number | null;
  video_url: string | null;
  video_created_at: string | null;
  series_id: string | null;
};

type Series = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  story_count: number;
  created_at: string;
  updated_at: string;
  has_character_consistency?: boolean;
};

// Helper function to format duration
function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Story Card Component (memoized, defined outside to prevent recreation)
const StoryCard = React.memo(({
  story,
  showEpisodeBadge = false,
  episodeNumber,
  seriesName,
  onDelete,
  onNavigate
}: {
  story: Story;
  showEpisodeBadge?: boolean;
  episodeNumber?: number;
  seriesName?: string | null;
  onDelete: (e: React.MouseEvent, storyId: string) => void;
  onNavigate: (storyId: string) => void;
}) => {
  return (
    <div className="group cursor-pointer relative">
      <div
        onClick={() => onNavigate(story.id)}
        className="relative rounded-md overflow-hidden bg-gray-900 border border-gray-800 hover:border-orange-600 transition-all duration-200 aspect-[9/16]"
      >
        {story.first_scene_image ? (
          <Image
            src={story.first_scene_image}
            alt={story.title || "Story"}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <ImageIcon className="w-8 h-8 text-gray-600" />
          </div>
        )}

        {/* Episode Badge */}
        {showEpisodeBadge && episodeNumber && (
          <div className="absolute top-1.5 left-1.5 bg-orange-900/90 text-orange-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
            EP {episodeNumber}
          </div>
        )}

        {/* Menu Button */}
        <div className="absolute top-1.5 right-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="p-1.5 bg-black/60 hover:bg-black/80 rounded-md transition-colors backdrop-blur-sm">
                <MoreHorizontal className="w-3.5 h-3.5 text-white" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-800">
              <DropdownMenuItem
                onClick={(e) => onDelete(e as any, story.id)}
                className="text-red-400 hover:text-red-300 hover:bg-gray-800 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete story
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2">
          {story.series_id && seriesName && !showEpisodeBadge && (
            <div className="flex items-center gap-1 mb-1">
              <Film className="w-2.5 h-2.5 text-orange-400" />
              <span className="text-[9px] text-orange-400 font-medium uppercase tracking-wide">
                {seriesName}
              </span>
            </div>
          )}
          <h3 className="text-xs font-semibold text-white line-clamp-2 mb-1.5">
            {story.title || "Untitled"}
          </h3>
          <div className="flex items-center flex-wrap gap-1">
            <div className="flex items-center gap-0.5 bg-gray-800/80 border border-transparent px-1.5 py-0.5 rounded text-[9px] text-gray-300">
              <ImageIcon className="w-2.5 h-2.5" />
              <span>{story.scene_count}</span>
            </div>
            {story.video_duration && story.video_duration > 0 && (
              <div className="flex items-center gap-0.5 bg-gray-800/80 border border-transparent px-1.5 py-0.5 rounded text-[9px] text-gray-300">
                <Clock className="w-2.5 h-2.5" />
                <span>{formatDuration(story.video_duration)}</span>
              </div>
            )}
            {story.video_url && (
              <div className="flex items-center gap-0.5 bg-green-600/20 border border-green-600/40 px-1.5 py-0.5 rounded text-[9px] text-green-400 font-medium">
                <Video className="w-2.5 h-2.5" />
                <span>Ready</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.story.id === nextProps.story.id &&
    prevProps.story.video_url === nextProps.story.video_url &&
    prevProps.story.first_scene_image === nextProps.story.first_scene_image &&
    prevProps.story.scene_count === nextProps.story.scene_count &&
    prevProps.story.video_duration === nextProps.story.video_duration &&
    prevProps.showEpisodeBadge === nextProps.showEpisodeBadge &&
    prevProps.episodeNumber === nextProps.episodeNumber &&
    prevProps.seriesName === nextProps.seriesName
  );
});
StoryCard.displayName = 'StoryCard';

// Memoized Story Grid Component
const StoryGrid = React.memo(({
  stories,
  showEpisodeBadge = false,
  totalStories = 0,
  seriesMap,
  onDelete,
  onNavigate
}: {
  stories: Story[];
  showEpisodeBadge?: boolean;
  totalStories?: number;
  seriesMap: Map<string, string>;
  onDelete: (e: React.MouseEvent, storyId: string) => void;
  onNavigate: (storyId: string) => void;
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {stories.map((story, index) => {
        const episodeNumber = showEpisodeBadge ? totalStories - index : undefined;
        const seriesName = story.series_id ? seriesMap.get(story.series_id) : null;
        return (
          <StoryCard
            key={story.id}
            story={story}
            showEpisodeBadge={showEpisodeBadge}
            episodeNumber={episodeNumber}
            seriesName={seriesName}
            onDelete={onDelete}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.stories.length !== nextProps.stories.length) return false;
  if (prevProps.showEpisodeBadge !== nextProps.showEpisodeBadge) return false;
  if (prevProps.totalStories !== nextProps.totalStories) return false;

  for (let i = 0; i < prevProps.stories.length; i++) {
    if (prevProps.stories[i].id !== nextProps.stories[i].id) return false;
  }

  return true;
});
StoryGrid.displayName = 'StoryGrid';

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { balance: creditBalance, loading: creditsLoading } = useCredits();
  const [stories, setStories] = useState<Story[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeriesForCreate, setSelectedSeriesForCreate] = useState<string | null>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("faceless-videos");
  const [sceneCount, setSceneCount] = useState(5);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [addToSeriesDialogOpen, setAddToSeriesDialogOpen] = useState(false);
  const [storyToAddToSeries, setStoryToAddToSeries] = useState<Story | null>(null);
  const [selectedSeriesForStory, setSelectedSeriesForStory] = useState<string | null>(null);
  const [addingToSeries, setAddingToSeries] = useState(false);
  const [removeFromSeriesDialogOpen, setRemoveFromSeriesDialogOpen] = useState(false);
  const [storyToRemoveFromSeries, setStoryToRemoveFromSeries] = useState<Story | null>(null);
  const [removingFromSeries, setRemovingFromSeries] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [newSeriesDescription, setNewSeriesDescription] = useState("");
  const [hasCharacterConsistency, setHasCharacterConsistency] = useState(false);
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [selectedSeriesView, setSelectedSeriesView] = useState<Series | null>(null); // Track selected series to view its stories
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Track mobile sidebar state
  const [showCreditsPage, setShowCreditsPage] = useState(false); // Track credits page view
  const [showCreateStoryForm, setShowCreateStoryForm] = useState(false); // Track inline create story form
  const [showHelpPage, setShowHelpPage] = useState(false); // Track help page view
  const [helpSearchQuery, setHelpSearchQuery] = useState('');
  const [selectedHelpArticle, setSelectedHelpArticle] = useState<KnowledgeArticle | null>(null);
  const [selectedHelpCategory, setSelectedHelpCategory] = useState<string | null>(null);
  const [runTour, setRunTour] = useState(false); // Product tour state
  const [deleteSeriesDialogOpen, setDeleteSeriesDialogOpen] = useState(false); // Delete series dialog state
  const [seriesToDelete, setSeriesToDelete] = useState<Series | null>(null); // Series to delete
  const [deletingSeries, setDeletingSeries] = useState(false); // Deleting series state
  const hasFetchedRef = useRef(false);

  // Pagination state
  const [storiesOffset, setStoriesOffset] = useState(0);
  const [hasMoreStories, setHasMoreStories] = useState(false);
  const [loadingMoreStories, setLoadingMoreStories] = useState(false);
  const [totalStories, setTotalStories] = useState(0);
  const [currentSeriesFilter, setCurrentSeriesFilter] = useState<string | null>(null); // Track which series we're filtering by

  // New story creation options
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("ash"); // ElevenLabs Ash - default
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [showCustomScenes, setShowCustomScenes] = useState(false);
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isBlankStory, setIsBlankStory] = useState(false); // Toggle for blank story mode

  // Show landing page for non-authenticated users
  // (Removed redirect to /login - will show landing page instead)

  useEffect(() => {
    // Prevent duplicate fetches (React Strict Mode calls useEffect twice)
    if (hasFetchedRef.current) {
      console.log("⏭️ Skipping duplicate stories fetch");
      return;
    }
    // Only fetch stories if user is authenticated
    if (!authLoading && user) {
      hasFetchedRef.current = true;
      // Only fetch stories if NOT coming from a series link (will be handled by query param effect)
      if (!router.query.seriesId) {
        fetchStories();
      }
      fetchSeries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Sync category from URL query parameter
  useEffect(() => {
    if (router.isReady) {
      // Handle category
      if (router.query.category) {
        const category = router.query.category as string;
        if (category === "series") {
          setSelectedCategory("series");

          // Auto-select series if seriesId provided
          if (router.query.seriesId && series.length > 0) {
            const seriesId = router.query.seriesId as string;
            const foundSeries = series.find(s => s.id === seriesId);
            if (foundSeries) {
              setSelectedSeriesView(foundSeries);
              // Fetch stories filtered by this series
              fetchStories(true, seriesId);
            }
          }
        } else {
          setSelectedCategory("faceless-videos");
        }
      }
    }
  }, [router.isReady, router.query.category, router.query.seriesId, series]);

  // Auto-start product tour for new users
  useEffect(() => {
    if (!authLoading && user) {
      const hasSeenTour = localStorage.getItem('kahaani_tour_completed');
      if (!hasSeenTour) {
        // Start tour after a short delay to ensure page is loaded
        setTimeout(() => {
          setRunTour(true);
        }, 1000);
      }
    }
  }, [user, authLoading]);

  // Countdown timer for delete confirmation
  useEffect(() => {
    if (deleteDialogOpen) {
      // Reset countdown when dialog opens
      setDeleteCountdown(5);

      // Start countdown
      const interval = setInterval(() => {
        setDeleteCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [deleteDialogOpen]);

  async function fetchStories(reset = true, seriesId: string | null = null) {
    if (reset) {
      setLoading(true);
      setStoriesOffset(0);
    }

    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const offset = reset ? 0 : storiesOffset;
      const limit = 10;

      // Build URL with series filter if provided
      let url = `/api/get_stories?limit=${limit}&offset=${offset}`;
      if (seriesId) {
        url += `&series_id=${seriesId}`;
      }

      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) {
        console.error("Failed to fetch stories:", res.status);
        if (reset) setStories([]);
        return;
      }
      const data = await res.json();

      if (reset) {
        setStories(data.stories || []);
        setStoriesOffset(10);
      } else {
        // Only append new stories without creating duplicates
        // Use callback form to avoid dependency on current stories state
        setStories(prevStories => {
          const existingIds = new Set(prevStories.map(s => s.id));
          const newStories = (data.stories || []).filter((s: Story) => !existingIds.has(s.id));
          if (newStories.length > 0) {
            return [...prevStories, ...newStories];
          }
          return prevStories; // Return same reference if no new stories
        });
        setStoriesOffset(offset + 10);
      }

      setHasMoreStories(data.hasMore || false);
      setTotalStories(data.total || 0);
      setCurrentSeriesFilter(seriesId);
    } catch (err) {
      console.error("Error fetching stories:", err);
      if (reset) setStories([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreStories() {
    setLoadingMoreStories(true);
    try {
      // Pass the current series filter to maintain context
      await fetchStories(false, currentSeriesFilter);
    } finally {
      setLoadingMoreStories(false);
    }
  }

  async function fetchSeries() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/series", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) {
        console.error("Failed to fetch series:", res.status);
        setSeries([]);
        return;
      }
      const data = await res.json();
      setSeries(data || []);
    } catch (err) {
      console.error("Error fetching series:", err);
      setSeries([]);
    }
  }

  // Fetch ElevenLabs voices
  async function fetchVoices() {
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
  }

  // Scene count is now managed directly by user selection (no need to calculate from duration)


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
    audio.play();
    audio.onended = () => setPlayingPreviewId(null);
    voicePreviewAudioRef.current = audio;
    setPlayingPreviewId(voiceId);
  };

  async function createStory() {
    // Validate: blank story doesn't need prompt, AI-generated does
    if (!isBlankStory && !newPrompt.trim()) return;

    setCreating(true);

    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please log in to create stories");
        router.push('/login');
        return;
      }

      const res = await fetch("/api/generate_scenes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          prompt: isBlankStory ? "MyAwesomeStory" : newPrompt,
          title: isBlankStory ? "MyAwesomeStory" : null,
          sceneCount: isBlankStory ? 1 : sceneCount,
          voice_id: selectedVoiceId,
          aspect_ratio: aspectRatio,
          isBlank: isBlankStory  // Flag to indicate blank story creation
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const storyId = data.story_id;

        // If creating for a series, add it to the series
        if (selectedSeriesForCreate && storyId) {
          await fetch("/api/series/add_story", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              story_id: storyId,
              series_id: selectedSeriesForCreate,
            }),
          });
        }

        // Close inline form and reset
        setShowCreateStoryForm(false);
        setNewPrompt("");
        setSceneCount(5);
        setShowCustomScenes(false);
        setSelectedVoiceId("ash");
        setAspectRatio("9:16");
        setIsBlankStory(false);
        setSelectedSeriesForCreate(null);

        // Navigate to story page
        if (storyId) {
          router.push(`/story/${storyId}`);
        }
      } else {
        const error = await res.json();
        alert(`Failed to create story: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Error creating story:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteStory() {
    if (!storyToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch("/api/delete_story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: storyToDelete,
        }),
      });

      if (res.ok) {
        // Remove story from local state
        setStories(stories.filter(s => s.id !== storyToDelete));
        setDeleteDialogOpen(false);
        setStoryToDelete(null);
      } else {
        const data = await res.json();
        console.error("Error deleting story:", data.error);
        alert(`Failed to delete story: ${data.error}`);
      }
    } catch (error) {
      console.error("Error deleting story:", error);
      alert("Failed to delete story. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteClick(e: React.MouseEvent, storyId: string) {
    e.stopPropagation(); // Prevent navigation to story page
    setStoryToDelete(storyId);
    setDeleteDialogOpen(true);
  }

  async function deleteSeries() {
    if (!seriesToDelete) return;
    setDeletingSeries(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ description: "Please log in", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/delete_series", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          series_id: seriesToDelete.id,
        }),
      });

      if (res.ok) {
        // Remove series from local state
        setSeries(series.filter(s => s.id !== seriesToDelete.id));
        setDeleteSeriesDialogOpen(false);
        setSeriesToDelete(null);
        toast({ description: "Series deleted successfully" });
      } else {
        const data = await res.json();
        console.error("Error deleting series:", data.error);
        toast({ description: `Failed to delete series: ${data.error}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deleting series:", error);
      toast({ description: "Failed to delete series. Please try again.", variant: "destructive" });
    } finally {
      setDeletingSeries(false);
    }
  }

  function handleDeleteSeriesClick(e: React.MouseEvent, series: Series) {
    e.stopPropagation(); // Prevent navigation to series view
    setSeriesToDelete(series);
    setDeleteSeriesDialogOpen(true);
  }

  function handleAddToSeriesClick(e: React.MouseEvent, story: Story) {
    e.stopPropagation();
    setStoryToAddToSeries(story);
    setSelectedSeriesForStory(story.series_id);
    setAddToSeriesDialogOpen(true);
  }

  async function addStoryToSeries() {
    if (!storyToAddToSeries || !selectedSeriesForStory) return;

    setAddingToSeries(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please log in");
        return;
      }

      const res = await fetch("/api/series/add_story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          story_id: storyToAddToSeries.id,
          series_id: selectedSeriesForStory,
        }),
      });

      if (res.ok) {
        // Update local state
        setStories(stories.map(s =>
          s.id === storyToAddToSeries.id
            ? { ...s, series_id: selectedSeriesForStory }
            : s
        ));
        setAddToSeriesDialogOpen(false);
        setStoryToAddToSeries(null);
        setSelectedSeriesForStory(null);
        // Refresh series list to update story counts
        await fetchSeries();

        // Show success toast
        const seriesName = series.find(s => s.id === selectedSeriesForStory)?.title || 'series';
        toast({ description: `Story added to ${seriesName}` });
      } else {
        const error = await res.json();
        toast({ description: `Failed to add story to series: ${error.error}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error adding story to series:", error);
      toast({ description: "Failed to add story to series", variant: "destructive" });
    } finally {
      setAddingToSeries(false);
    }
  }

  function handleRemoveFromSeriesClick(e: React.MouseEvent, story: Story) {
    e.stopPropagation();
    setStoryToRemoveFromSeries(story);
    setRemoveFromSeriesDialogOpen(true);
  }

  async function confirmRemoveFromSeries() {
    if (!storyToRemoveFromSeries) return;

    setRemovingFromSeries(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please log in");
        return;
      }

      const res = await fetch("/api/series/add_story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          story_id: storyToRemoveFromSeries.id,
          series_id: null, // Remove from series
        }),
      });

      if (res.ok) {
        // Update local state
        setStories(stories.map(s =>
          s.id === storyToRemoveFromSeries.id
            ? { ...s, series_id: null }
            : s
        ));
        // Refresh series list to update story counts
        await fetchSeries();
        setRemoveFromSeriesDialogOpen(false);
        setStoryToRemoveFromSeries(null);

        // Show success toast
        toast({ description: "Story removed from series" });
      } else {
        const error = await res.json();
        toast({ description: `Failed to remove story from series: ${error.error}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error removing story from series:", error);
      toast({ description: "Failed to remove story from series", variant: "destructive" });
    } finally {
      setRemovingFromSeries(false);
    }
  }

  async function createSeries() {
    if (!newSeriesTitle.trim()) return;
    setCreatingSeries(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please log in to create series");
        router.push('/login');
        return;
      }

      const res = await fetch("/api/series", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title: newSeriesTitle,
          description: newSeriesDescription,
          has_character_consistency: hasCharacterConsistency,
        }),
      });

      if (res.ok) {
        const newSeries = await res.json();
        setSeriesDialogOpen(false);
        setNewSeriesTitle("");
        setNewSeriesDescription("");
        setHasCharacterConsistency(false);
        // Refresh series list
        await fetchSeries();
        // Navigate to series detail page
        router.push(`/series/${newSeries.id}`);
      } else {
        const error = await res.json();
        alert(`Failed to create series: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Error creating series:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreatingSeries(false);
    }
  }

  function openCreateStoryDialog(seriesId: string | null = null) {
    setSelectedSeriesForCreate(seriesId);
    setShowCreateStoryForm(true);
    // Load voices automatically when opening the form
    if (voices.length === 0 && !loadingVoices) {
      fetchVoices();
    }
  }

  // Group stories by series (memoized to prevent recalculation on every render)
  const storiesBySeries = React.useMemo(() => {
    const grouped = stories.reduce((acc, story) => {
      const key = story.series_id || 'no-series';
      if (!acc[key]) acc[key] = [];
      acc[key].push(story);
      return acc;
    }, {} as Record<string, Story[]>);

    // Sort stories within each series by created_at (most recent first)
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    return grouped;
  }, [stories]);

  // Create series map for tooltips (memoized)
  const seriesMap = React.useMemo(() => {
    return new Map(series.map(s => [s.id, s.title]));
  }, [series]);

  // Stable callbacks for StoryCard
  const handleStoryNavigate = React.useCallback((storyId: string) => {
    router.push(`/story/${storyId}`);
  }, [router]);

  const handleStoryDelete = React.useCallback((e: React.MouseEvent, storyId: string) => {
    handleDeleteClick(e, storyId);
  }, []);

  // Series Card Component
  const SeriesCard = ({ series: s }: { series: Series }) => {
    const seriesStories = storiesBySeries[s.id] || [];
    const firstStoryImage = seriesStories[0]?.first_scene_image;

    return (
      <div
        onClick={() => {
          setSelectedSeriesView(s);
          // Load stories for this series with pagination
          fetchStories(true, s.id);
        }}
        className="group cursor-pointer"
      >
        <div className="relative rounded-md overflow-hidden bg-gray-900 border border-gray-800 hover:border-orange-600 transition-all duration-200 aspect-[9/16]">
          {firstStoryImage ? (
            <Image
              src={firstStoryImage}
              alt={s.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
              <List className="w-8 h-8 text-gray-600" />
            </div>
          )}

          {/* Series Badge */}
          <div className="absolute top-1.5 left-1.5 bg-blue-900/90 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
            SERIES
          </div>

          {/* 3-dots menu for empty series */}
          {s.story_count === 0 && (
            <div className="absolute top-1.5 right-1.5" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1 rounded-full bg-gray-900/80 hover:bg-gray-800 text-white transition-colors"
                    aria-label="Series options"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                  <DropdownMenuItem
                    onClick={(e) => handleDeleteSeriesClick(e, s)}
                    className="text-red-400 hover:text-red-300 hover:bg-gray-800 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Series
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2">
            <h3 className="text-xs font-semibold text-white line-clamp-2 mb-1.5">
              {s.title}
            </h3>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex items-center gap-0.5 bg-orange-600/20 border border-orange-600/40 px-1.5 py-0.5 rounded text-[9px] text-orange-400 font-medium">
                <Film className="w-2.5 h-2.5" />
                <span>{s.story_count} {s.story_count === 1 ? 'episode' : 'episodes'}</span>
              </div>
              {s.has_character_consistency && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-0.5 bg-green-600/20 border border-green-600/40 px-1.5 py-0.5 rounded text-[9px] text-green-400 font-medium cursor-help">
                      <User className="w-2.5 h-2.5" />
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Visual Consistency enabled</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Format voice labels for display
  function formatVoiceLabels(labels?: Record<string, any>): string {
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
  }

  // Show landing page if user is not authenticated
  if (!authLoading && !user) {
    return <LandingPage />;
  }

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-orange-500" />
      </div>
    );
  }

  // Render the create story dialog content
  const renderDialogContent = () => (
    <div className="space-y-4">
      {/* Info Notice - Show when creating standalone story */}
      {!selectedSeriesForCreate && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            This story will be created independently and won't be part of any series.
          </p>
        </div>
      )}

      {/* Story Input Section */}
      {!isBlankStory && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-base font-semibold text-white">Add your story or provide an idea</label>

            {/* Toggle Buttons */}
            <div className="inline-flex gap-1 p-1 bg-gray-800/50 rounded-lg border border-gray-700">
              <button
                type="button"
                onClick={() => setIsBlankStory(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  !isBlankStory
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                AI Generated
              </button>
              <button
                type="button"
                onClick={() => setIsBlankStory(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  isBlankStory
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                Blank
              </button>
            </div>
          </div>

          <textarea
            data-tour="story-prompt-input"
            placeholder="A young blacksmith forges a sword from fallen stars, awakening an ancient power that will either save the kingdom or doom it forever."
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            rows={6}
            className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder:text-gray-500 text-base transition-all"
          />
        </div>
      )}

      {/* Show toggle for Blank story mode */}
      {isBlankStory && (
        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div>
            <label className="text-sm font-semibold text-white">
              Story Type
            </label>
            <p className="text-xs text-gray-500 mt-0.5">Choose how to create your story</p>
          </div>

          {/* Compact Toggle Buttons */}
          <div className="inline-flex gap-1.5 p-1 bg-gray-800 rounded-lg border border-gray-700">
            <button
              type="button"
              onClick={() => setIsBlankStory(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                !isBlankStory
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              AI Generated
            </button>
            <button
              type="button"
              onClick={() => setIsBlankStory(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                isBlankStory
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Blank
            </button>
          </div>
        </div>
      )}

      {/* Scenes - Only show for AI-generated stories */}
      {!isBlankStory && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white">Number of scenes for your story</label>
          <div data-tour="scene-count-selector" className="grid grid-cols-3 gap-1.5">
            {[5, 10, 15].map((scenes) => {
            const estimatedSeconds = scenes * 8;
            const estimatedMinutes = Math.floor(estimatedSeconds / 60);
            const remainingSeconds = estimatedSeconds % 60;
            const timeDisplay = estimatedMinutes > 0
              ? `~${estimatedMinutes}m ${remainingSeconds}s`
              : `~${estimatedSeconds}s`;
            const estimatedCredits = scenes * (CREDIT_COSTS.IMAGE_PER_SCENE + CREDIT_COSTS.AUDIO_PER_SCENE);
            const isDisabled = creditBalance <= 15 && scenes > 5;
            return (
              <button
                key={scenes}
                type="button"
                onClick={() => {
                  if (!isDisabled) {
                    setSceneCount(scenes);
                    setShowCustomScenes(false);
                  }
                }}
                disabled={isDisabled}
                className={`p-2.5 rounded-lg border-2 transition-all relative ${
                  sceneCount === scenes && !showCustomScenes
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : isDisabled
                    ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed opacity-50'
                    : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-orange-500/50 hover:bg-gray-800'
                }`}
              >
                {isDisabled && (
                  <div className="absolute top-0 left-0 right-0 bg-orange-900/30 text-orange-400 text-[8px] font-semibold py-0.5 rounded-t-md text-center">
                    Low credits
                  </div>
                )}
                <div className="text-xs font-bold mb-0.5">{scenes} scenes</div>
                <div className="flex items-center justify-center gap-1 text-[9px] text-gray-500">
                  <span>{timeDisplay}</span>
                  <span>•</span>
                  <span>{estimatedCredits} credits</span>
                </div>
              </button>
            );
          })}
          </div>

          {/* Custom scenes toggle */}
          {!showCustomScenes && (
            <button
              type="button"
              onClick={() => setShowCustomScenes(true)}
              className="text-xs text-orange-400 hover:text-orange-300 underline"
            >
              Custom scene count
            </button>
          )}

          {/* Custom scene slider - full width below buttons */}
          {showCustomScenes && (
            <div className="mt-2 p-2.5 bg-gray-800 rounded-lg border border-gray-700">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-gray-300">
                  Scenes: <span className="text-orange-400 font-bold">{sceneCount}</span>
                </label>
                <div className="flex items-center gap-1 text-[9px] text-gray-400">
                  <span>~{(() => {
                    const estimatedSeconds = sceneCount * 8;
                    const mins = Math.floor(estimatedSeconds / 60);
                    const secs = estimatedSeconds % 60;
                    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                  })()}</span>
                  <span>•</span>
                  <Coins className="w-2.5 h-2.5" />
                  <span>~{sceneCount * (CREDIT_COSTS.IMAGE_PER_SCENE + CREDIT_COSTS.AUDIO_PER_SCENE)} credits</span>
                </div>
              </div>
              <Slider
                value={[sceneCount]}
                onValueChange={(value) => setSceneCount(value[0])}
                min={3}
                max={50}
                step={1}
                className="w-full"
              />
            </div>
          )}

          {creditBalance <= 15 && (
            <p className="text-[10px] text-orange-400 mt-2">
              You have {creditBalance} credits. Get more to create longer stories.
            </p>
          )}
        </div>
      )}

      {/* Format */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-white">Format</label>
        <div data-tour="format-selector" className="grid grid-cols-3 gap-1.5">
          {[
            { value: "9:16", icon: Smartphone, label: "9:16" },
            { value: "16:9", icon: Monitor, label: "16:9" },
            { value: "1:1", icon: Square, label: "1:1" }
          ].map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAspectRatio(value as any)}
              className={`p-2.5 rounded-lg border-2 transition-all ${
                aspectRatio === value
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-orange-500/50 hover:bg-gray-800'
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-0.5 ${aspectRatio === value ? 'text-orange-400' : 'text-gray-400'}`} />
              <div className={`text-xs font-bold ${aspectRatio === value ? 'text-orange-400' : 'text-gray-300'}`}>
                {label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Voice Selection */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-white">Voice</label>
        {loadingVoices ? (
          <div className="flex items-center justify-center py-8 bg-gray-800/50 border border-gray-700 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            <span className="ml-2 text-xs text-gray-400">Loading...</span>
          </div>
        ) : voices.length > 0 ? (
          <div data-tour="voice-selector" className="grid grid-cols-4 gap-1.5">
            {voices.slice(0, 8).map((voice) => (
              <button
                key={voice.id}
                type="button"
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`p-2.5 rounded-lg border-2 transition-all text-left relative group ${
                  selectedVoiceId === voice.id
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-orange-500/50 hover:bg-gray-800'
                }`}
              >
                <div className={`text-xs font-bold mb-1 ${selectedVoiceId === voice.id ? 'text-orange-400' : 'text-white'}`}>
                  {voice.name}
                </div>
                {voice.labels && formatVoiceLabels(voice.labels) && (
                  <div className="text-[9px] text-gray-500 line-clamp-1 mb-1">
                    {formatVoiceLabels(voice.labels)}
                  </div>
                )}
                {/* Preview button */}
                {voice.preview_url && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      playVoicePreview(voice.id, voice.preview_url);
                    }}
                    className={`w-full mt-1 px-2 py-1 rounded text-[9px] font-medium transition-colors text-center ${
                      playingPreviewId === voice.id
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-700/80 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {playingPreviewId === voice.id ? 'Stop' : 'Preview'}
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 bg-gray-800/50 border border-gray-700 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
          </div>
        )}
      </div>

      {/* Info note */}
      <p className="text-[10px] text-gray-500 text-center -mt-1">
        All settings adjustable after creation
      </p>

      {/* Create Button */}
      <Button
        data-tour="create-button"
        disabled={creating || (!isBlankStory && !newPrompt.trim())}
        onClick={createStory}
        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-base py-4 rounded-lg"
      >
        {creating ? (
          <>
            <Loader2 className="animate-spin h-5 w-5 mr-2" /> Creating Your Story...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" /> {isBlankStory ? 'Create Blank Story' : 'Create Story'}
          </>
        )}
      </Button>
    </div>
  );

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-black text-white flex">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sidebar Drawer */}
          <div className="md:hidden fixed inset-y-0 left-0 w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-50 transform transition-transform duration-300">
            {/* Close button */}
            <div className="p-4 flex items-center justify-between border-b border-gray-800">
              <h2 className="text-xl font-bold text-white">Menu</h2>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">
                  Categories
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory("faceless-videos");
                    setShowCreditsPage(false);
                    setShowHelpPage(false);
                    setMobileMenuOpen(false);
                    // Clear series filter when switching to Stories tab
                    if (currentSeriesFilter !== null) {
                      fetchStories(true, null);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    selectedCategory === "faceless-videos"
                      ? "bg-orange-600 text-white"
                      : "text-gray-400 hover:bg-gray-900 hover:text-white"
                  }`}
                >
                  <Video className="w-5 h-5" />
                  <span className="font-medium">Stories</span>
                </button>

                <button
                  data-tour="series-tab"
                  onClick={() => {
                    setSelectedCategory("series");
                    setSelectedSeriesView(null);
                    setShowCreditsPage(false);
                    setShowHelpPage(false);
                    setMobileMenuOpen(false);
                    // Clear series filter when switching to Series tab
                    if (currentSeriesFilter !== null) {
                      fetchStories(true, null);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mt-1 ${
                    selectedCategory === "series"
                      ? "bg-orange-600 text-white"
                      : "text-gray-400 hover:bg-gray-900 hover:text-white"
                  }`}
                >
                  <Film className="w-5 h-5" />
                  <span className="font-medium">Series</span>
                </button>
              </div>
            </nav>

            {/* Credit Balance Section */}
            <div className="border-t border-gray-800 p-4">
              <div data-tour="credits-display" className="bg-gradient-to-br from-orange-600/20 to-pink-600/20 border border-orange-600/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Credits</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  {creditsLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-white">{creditBalance}</span>
                      <span className="text-xs text-gray-500">available</span>
                    </>
                  )}
                </div>
                <Button
                  onClick={() => {
                    setShowCreditsPage(true);
                    setShowHelpPage(false);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
                >
                  <Coins className="w-4 h-4 mr-2" />
                  Buy Credits
                </Button>
              </div>

              {/* Help & Support Button */}
              <Button
                data-tour="help-button"
                onClick={() => {
                  setShowHelpPage(true);
                  setShowCreditsPage(false);
                  setSelectedSeriesView(null);
                  setMobileMenuOpen(false);
                }}
                variant="outline"
                className="w-full mt-3 border-gray-700 text-white hover:bg-gray-800 text-sm font-semibold"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help & Support
              </Button>
            </div>

            {/* User Profile Section */}
            <div className="border-t border-gray-800 p-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-900 cursor-pointer transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">User Account</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email || 'user@example.com'}</p>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-800">
                  <DropdownMenuItem
                    className="flex items-center gap-3 text-gray-400 hover:text-red-400 hover:bg-gray-800 cursor-pointer"
                    onClick={signOut}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </>
      )}

      {/* Left Sidebar - Desktop only */}
      <div className="hidden md:flex w-64 bg-gray-950 border-r border-gray-800/50 flex-col fixed h-full">
        {/* Logo/Brand */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Kahaani</h1>
              <p className="text-xs text-gray-500 mt-0.5">AI Story Studio</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-3 mb-3">
              Categories
            </p>
            <button
              onClick={() => {
                setSelectedCategory("faceless-videos");
                setShowCreditsPage(false);
                setShowHelpPage(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                selectedCategory === "faceless-videos"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:bg-gray-900 hover:text-white"
              }`}
            >
              <Video className="w-5 h-5" />
              <span className="font-semibold">Stories</span>
            </button>

            <button
              onClick={() => {
                setSelectedCategory("series");
                setSelectedSeriesView(null);
                setShowCreditsPage(false);
                setShowHelpPage(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all mt-2 ${
                selectedCategory === "series"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:bg-gray-900 hover:text-white"
              }`}
            >
              <Film className="w-5 h-5" />
              <span className="font-semibold">Series</span>
            </button>
          </div>
        </nav>

        {/* Credit Balance Section */}
        <div className="border-t border-gray-800 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Credits</span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-3">
              {creditsLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
              ) : (
                <>
                  <span className="text-2xl font-bold text-white">{creditBalance}</span>
                  <span className="text-xs text-gray-500">available</span>
                </>
              )}
            </div>
            <Button
              onClick={() => {
                setShowCreditsPage(true);
                setShowHelpPage(false);
              }}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
            >
              <Coins className="w-4 h-4 mr-2" />
              Buy Credits
            </Button>
          </div>

          {/* Help & Support Button */}
          <Button
            onClick={() => {
              setShowHelpPage(true);
              setShowCreditsPage(false);
              setSelectedSeriesView(null);
            }}
            variant="outline"
            className="w-full mt-3 border-gray-700 text-white hover:bg-gray-800 text-sm font-semibold"
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            Help & Support
          </Button>
        </div>

        {/* User Profile Section */}
        <div className="border-t border-gray-800 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-900 cursor-pointer transition-colors">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">User Account</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email || 'user@example.com'}</p>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-800">
              <DropdownMenuItem
                className="flex items-center gap-3 text-gray-400 hover:text-red-400 hover:bg-gray-800 cursor-pointer"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-64 w-full">
        {/* Mobile Header */}
        <div className="md:hidden border-b border-gray-800 bg-gray-950 sticky top-0 z-20 px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-white">Kahaani</h1>
            {/* Show New button only when not viewing a specific series (has + tile) and not on create form/credits/help page */}
            {!selectedSeriesView && !showCreateStoryForm && !showCreditsPage && !showHelpPage && (
              <Button
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                onClick={() => {
                  if (selectedCategory === "series") {
                    setSeriesDialogOpen(true);
                  } else {
                    openCreateStoryDialog(null);
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> New
              </Button>
            )}
            {/* Show spacer when button is hidden to maintain layout */}
            {(selectedSeriesView || showCreateStoryForm || showCreditsPage) && (
              <div className="w-[60px]"></div>
            )}
          </div>
        </div>

        {/* Stories by Series - Netflix Style */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          {/* Header with Create Buttons */}
          <div className="flex items-center justify-between mb-6">
            {showCreditsPage ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Coins className="w-6 h-6 text-orange-500" />
                  <h1 className="text-3xl font-bold text-white">Buy Credits</h1>
                </div>
                <button
                  onClick={() => setShowCreditsPage(false)}
                  className="text-sm text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1 w-fit"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to Dashboard</span>
                </button>
              </div>
            ) : showCreateStoryForm ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-orange-500" />
                  <h1 className="text-3xl font-bold text-white">
                    {selectedSeriesForCreate && selectedSeriesView
                      ? `Create New Story in ${selectedSeriesView.title} series`
                      : 'Create New Story'}
                  </h1>
                </div>
                <button
                  onClick={() => {
                    setShowCreateStoryForm(false);
                    setSelectedSeriesForCreate(null);
                    setNewPrompt("");
                    setIsBlankStory(false);
                  }}
                  className="text-sm text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1 w-fit"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to {selectedSeriesView ? selectedSeriesView.title : 'Stories'}</span>
                </button>
              </div>
            ) : selectedCategory === "series" && selectedSeriesView ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Film className="w-6 h-6 text-orange-500" />
                  <h1 className="text-3xl font-bold text-white">{selectedSeriesView.title}</h1>
                  {selectedSeriesView.has_character_consistency && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-600/20 border border-green-600/40 rounded-lg text-green-400 text-xs font-medium cursor-help">
                          <User className="w-3.5 h-3.5" />
                          <span>Visual Consistency</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Characters and environments have consistent appearance across all episodes</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedSeriesView(null);
                    // Clear series filter and reload all stories
                    fetchStories(true, null);
                  }}
                  className="text-sm text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1 w-fit"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to Series Dashboard</span>
                </button>
              </div>
            ) : (
              <h1 className="text-3xl font-bold text-white">
                {showHelpPage ? "Help & Support" : selectedCategory === "series" ? "Series" : "Stories"}
              </h1>
            )}
            {/* Desktop Create Buttons - Hidden on mobile, credits page, help page, and create form */}
            {!showCreditsPage && !showHelpPage && !showCreateStoryForm && (
            <div className="hidden md:flex gap-3">
              {selectedCategory === "series" && !selectedSeriesView && (
              <Dialog open={seriesDialogOpen} onOpenChange={setSeriesDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-orange-600 hover:bg-orange-700">
                    <Plus className="w-4 h-4 mr-2" />
                    New Series
                  </Button>
                </DialogTrigger>
                  <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-bold">Create a New Series</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-300">Series Title</label>
                        <Input
                          placeholder="e.g., Adventure Chronicles"
                          value={newSeriesTitle}
                          onChange={(e) => setNewSeriesTitle(e.target.value)}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-300">Description (Optional)</label>
                        <textarea
                          placeholder="What's this series about?"
                          value={newSeriesDescription}
                          onChange={(e) => setNewSeriesDescription(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          rows={3}
                        />
                      </div>

                      <div className="bg-orange-950/30 border border-orange-700/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id="character-consistency"
                            checked={hasCharacterConsistency}
                            onCheckedChange={(checked) => setHasCharacterConsistency(checked as boolean)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <label
                              htmlFor="character-consistency"
                              className="text-sm font-semibold text-white cursor-pointer block"
                            >
                              Visual Consistency
                            </label>
                            <p className="text-xs text-gray-300 mt-1">
                              When enabled, characters and environments will have consistent appearance across all episodes.
                            </p>
                            <p className="text-xs text-orange-300 mt-1.5 font-medium">
                              Example: "Ray the rabbit" will have the same appearance in every episode.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-2 text-xs text-orange-200/80">
                          <span className="font-bold">⚠️</span>
                          <span>This cannot be changed after series creation</span>
                        </div>
                      </div>

                      <Button
                        onClick={createSeries}
                        disabled={!newSeriesTitle.trim() || creatingSeries}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                      >
                        {creatingSeries ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Series
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Only show New Story button on Stories tab */}
              {selectedCategory !== "series" && (
              <Button
                data-tour="create-story-button"
                className="bg-orange-600 hover:bg-orange-700"
                onClick={() => openCreateStoryDialog(null)}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Story
              </Button>
              )}
            </div>
            )}
          </div>

        {showHelpPage ? (
          // Help & Support Page
          <div className="max-w-5xl mx-auto pb-20">
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
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">New to Kahaani?</h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Take a quick guided tour to learn how to create amazing AI-powered stories.
                        It only takes a minute!
                      </p>
                        <Button
                          onClick={() => {
                            // Navigate to Stories tab and reset all views before starting tour
                            setShowHelpPage(false);
                            setShowCreditsPage(false);
                            setSelectedSeriesView(null);
                            setShowCreateStoryForm(false);
                            setSelectedCategory("faceless-videos");
                            // Start tour after state updates
                            setTimeout(() => setRunTour(true), 100);
                          }}
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Take Product Tour
                        </Button>
                    </div>
                  </div>
                )}

                {/* Category Grid */}
                {!helpSearchQuery && !selectedHelpCategory && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Browse by Category</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  <Button onClick={() => { if (typeof window !== 'undefined' && window.Tawk_API) window.Tawk_API.maximize(); }} className="bg-orange-600 hover:bg-orange-700 text-white">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Chat with Support
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : showCreditsPage ? (
          // Credits page iframe
          <div className="w-full h-[calc(100vh-200px)]">
            <iframe
              src="/credits?embedded=true"
              className="w-full h-full border-0 rounded-lg"
              title="Buy Credits"
            />
          </div>
        ) : showCreateStoryForm ? (
          // Inline Create Story Form
          <div className="max-w-3xl mx-auto">
            {renderDialogContent()}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin h-8 w-8 text-orange-500 mr-3" />
            <span className="text-gray-400 text-lg">Loading...</span>
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-20">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                <Film className="w-12 h-12 text-orange-400" />
              </div>
            </div>
            <h3 className="text-2xl font-semibold text-white mb-4">No stories yet</h3>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Ready to create your first story?
            </p>
            <Button onClick={() => openCreateStoryDialog()} className="bg-orange-600 hover:bg-orange-700">
              <Plus className="w-4 h-4 mr-2" /> Create First Story
            </Button>
          </div>
        ) : selectedCategory === "series" ? (
          selectedSeriesView ? (
            // Viewing stories from a specific series
            <>
              {/* Series Filter Banner - Mobile Responsive */}
              <div className="mb-6 bg-gradient-to-r from-orange-900/20 to-orange-800/10 border border-orange-600/30 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
                    <Film className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-orange-300/70 font-medium uppercase tracking-wider">Viewing Series</p>
                    <h2 className="text-base sm:text-lg font-semibold text-white truncate">{selectedSeriesView.title}</h2>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setSelectedSeriesView(null);
                    setCurrentSeriesFilter(null);
                    fetchStories(true, null);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white hover:border-orange-500 w-full sm:w-auto flex-shrink-0"
                >
                  <span className="hidden sm:inline">View All Stories</span>
                  <span className="sm:hidden">View All</span>
                </Button>
              </div>

              {stories.length === 0 && !loading ? (
                <div className="text-center py-20">
                  <div className="mb-6 flex justify-center">
                    <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                      <Film className="w-12 h-12 text-orange-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-4">No Stories in This Series Yet</h3>
                  <p className="text-gray-400 mb-8 max-w-md mx-auto">
                    Start building your series by creating the first story.
                  </p>
                  <Button onClick={() => openCreateStoryDialog(selectedSeriesView.id)} className="bg-orange-600 hover:bg-orange-700">
                    <Plus className="w-4 h-4 mr-2" /> Create First Episode
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {/* Add New Episode Placeholder */}
                    <button
                      onClick={() => openCreateStoryDialog(selectedSeriesView.id)}
                      className="aspect-[9/16] rounded-lg border-2 border-dashed border-gray-700 hover:border-orange-500 bg-gray-900/50 hover:bg-gray-800/50 transition-all flex flex-col items-center justify-center gap-3 group"
                    >
                      <div className="w-12 h-12 rounded-full bg-orange-600/20 group-hover:bg-orange-600/30 flex items-center justify-center transition-colors">
                        <Plus className="w-6 h-6 text-orange-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-400 group-hover:text-orange-400 transition-colors">Add Episode</span>
                    </button>

                    {/* Render story cards in series view */}
                    {stories.map((story, index) => {
                      const episodeNumber = totalStories - index;
                      const seriesName = story.series_id ? seriesMap.get(story.series_id) : null;
                      return (
                        <StoryCard
                          key={story.id}
                          story={story}
                          showEpisodeBadge={true}
                          episodeNumber={episodeNumber}
                          seriesName={seriesName}
                          onDelete={handleStoryDelete}
                          onNavigate={handleStoryNavigate}
                        />
                      );
                    })}
                  </div>

                  {/* Load More button for series view */}
                  {hasMoreStories && stories.length > 0 && (
                    <div className="flex justify-center mt-8">
                      <Button
                        onClick={loadMoreStories}
                        disabled={loadingMoreStories}
                        variant="outline"
                        className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white"
                      >
                        {loadingMoreStories ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          `Load More (${totalStories - stories.length} remaining)`
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : series.length === 0 ? (
            <div className="text-center py-20">
              <div className="mb-6 flex justify-center">
                <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                  <List className="w-12 h-12 text-orange-400" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">No series yet</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                Create a series to organize related stories together
              </p>
              <Button onClick={() => setSeriesDialogOpen(true)} className="bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-2" /> Create First Series
              </Button>
            </div>
          ) : (
            <>
              {/* Page Header for All Series */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">All Series</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {series.length > 0 ? `${series.length} ${series.length === 1 ? 'series' : 'series'} total` : 'No series yet'}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {series.map((s) => (
                  <SeriesCard key={s.id} series={s} />
                ))}
              </div>
            </>
          )
        ) : (
          <>
            {/* Page Header for All Stories */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">All Stories</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {totalStories > 0 ? `${totalStories} ${totalStories === 1 ? 'story' : 'stories'} total` : 'No stories yet'}
                </p>
              </div>
            </div>

            {/* Use memoized StoryGrid to prevent flickering on load more */}
            <StoryGrid
              stories={stories}
              showEpisodeBadge={false}
              totalStories={totalStories}
              seriesMap={seriesMap}
              onDelete={handleStoryDelete}
              onNavigate={handleStoryNavigate}
            />

            {/* Load More button */}
            {hasMoreStories && stories.length > 0 && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={loadMoreStories}
                  disabled={loadingMoreStories}
                  variant="outline"
                  className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white"
                >
                  {loadingMoreStories ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${totalStories - stories.length} remaining)`
                  )}
                </Button>
              </div>
            )}

            {/* Show empty state only if no stories */}
            {stories.length === 0 && (
            <div className="text-center py-20">
              <div className="mb-6 flex justify-center">
                <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                  <Film className="w-12 h-12 text-orange-400" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">No stories yet</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                Create your first story to get started.
              </p>
              <Button onClick={() => openCreateStoryDialog()} className="bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-2" /> Create Story
              </Button>
            </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Delete Story?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">
              Are you sure you want to delete this story? This will permanently delete:
            </p>
            <ul className="list-disc list-inside text-gray-400 text-sm space-y-1 ml-2">
              <li>All scenes and their text</li>
              <li>All generated images</li>
              <li>All audio narration</li>
              <li>All generated videos</li>
            </ul>
            <p className="text-red-400 text-sm font-semibold">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setStoryToDelete(null);
                }}
                disabled={deleting}
                className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={deleteStory}
                disabled={deleting || deleteCountdown > 0}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Deleting...
                  </>
                ) : deleteCountdown > 0 ? (
                  <>
                    Delete in {deleteCountdown}...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Story
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Series Confirmation Dialog */}
      <Dialog open={deleteSeriesDialogOpen} onOpenChange={setDeleteSeriesDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Delete Series?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">
              Are you sure you want to delete the series "{seriesToDelete?.title}"?
            </p>
            <p className="text-red-400 text-sm font-semibold">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteSeriesDialogOpen(false);
                  setSeriesToDelete(null);
                }}
                disabled={deletingSeries}
                className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={deleteSeries}
                disabled={deletingSeries}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {deletingSeries ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Series
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to Series Dialog */}
      <Dialog open={addToSeriesDialogOpen} onOpenChange={setAddToSeriesDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Add to Series
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-gray-400">
              Select a series for "{storyToAddToSeries?.title || 'this story'}"
            </p>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {series.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-4">No series yet.</p>
                  <Button
                    onClick={() => {
                      setAddToSeriesDialogOpen(false);
                      setSeriesDialogOpen(true);
                    }}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Series
                  </Button>
                </div>
              ) : (
                series.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSeriesForStory(s.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedSeriesForStory === s.id
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{s.title}</p>
                        <p className="text-xs text-gray-400">
                          {s.story_count} {s.story_count === 1 ? 'story' : 'stories'}
                        </p>
                      </div>
                      {selectedSeriesForStory === s.id && (
                        <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {series.length > 0 && (
              <div className="flex gap-3 justify-end pt-2 border-t border-gray-800">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddToSeriesDialogOpen(false);
                    setStoryToAddToSeries(null);
                    setSelectedSeriesForStory(null);
                  }}
                  disabled={addingToSeries}
                  className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={addStoryToSeries}
                  disabled={!selectedSeriesForStory || addingToSeries}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {addingToSeries ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add to Series'
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove from Series Confirmation Dialog */}
      <Dialog open={removeFromSeriesDialogOpen} onOpenChange={setRemoveFromSeriesDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Remove from Series?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">
              Are you sure you want to remove <span className="font-semibold text-white">"{storyToRemoveFromSeries?.title || 'this story'}"</span> from its series?
            </p>
            <p className="text-gray-400 text-sm">
              The story will remain in your library and can be added to a series again later.
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setRemoveFromSeriesDialogOpen(false);
                  setStoryToRemoveFromSeries(null);
                }}
                disabled={removingFromSeries}
                className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmRemoveFromSeries}
                disabled={removingFromSeries}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {removingFromSeries ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Removing...
                  </>
                ) : (
                  'Remove from Series'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Tour */}
      <ProductTour
        run={runTour}
        mode="dashboard"
        onFinish={() => {
          setRunTour(false);
          setShowCreateStoryForm(false); // Close inline form when tour finishes
          localStorage.setItem('kahaani_tour_completed', 'true');
        }}
        onStepChange={(stepIndex) => {
          // Open form when entering step 2 (story input field)
          // This means step 1 (New Story button) has been shown
          if (stepIndex === 2) {
            openCreateStoryDialog(null);
          }
        }}
      />
    </div>
    </TooltipProvider>
  );
}
