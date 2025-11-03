import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, PlayCircle, Clock, Film, Image as ImageIcon, Video, Settings, User, LogOut, Trash2, MoreHorizontal, Smartphone, Square, Monitor, Coins, List, ArrowLeft, Menu, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LandingPage } from "@/components/LandingPage";
import { useCredits } from "../hooks/useCredits";
import { toast } from "@/hooks/use-toast";

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
};

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
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [showSeriesStories, setShowSeriesStories] = useState(false); // Hide series stories by default
  const [selectedSeriesView, setSelectedSeriesView] = useState<Series | null>(null); // Track selected series to view its stories
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Track mobile sidebar state
  const hasFetchedRef = useRef(false);

  // New story creation options
  const [targetDuration, setTargetDuration] = useState<30 | 60 | 120 | 180>(
    creditBalance <= 15 ? 30 : 60
  ); // in seconds - default to 30s if low credits
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("alloy"); // OpenAI Alloy - default
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
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
      fetchStories();
      fetchSeries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Sync category from URL query parameter
  useEffect(() => {
    if (router.isReady && router.query.category) {
      const category = router.query.category as string;
      if (category === "series") {
        setSelectedCategory("series");
      } else {
        setSelectedCategory("faceless-videos");
      }
    }
  }, [router.isReady, router.query.category]);

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

  async function fetchStories() {
    setLoading(true);
    try {
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch("/api/get_stories", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) {
        console.error("Failed to fetch stories:", res.status);
        setStories([]);
        return;
      }
      const data = await res.json();
      setStories(data || []);
    } catch (err) {
      console.error("Error fetching stories:", err);
      setStories([]);
    } finally {
      setLoading(false);
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

  // Calculate scene count based on target duration (rough estimate: ~6 seconds per scene)
  useEffect(() => {
    const estimatedScenes = Math.max(3, Math.round(targetDuration / 6));
    setSceneCount(estimatedScenes);
  }, [targetDuration]);

  // Load voices when dialog opens
  useEffect(() => {
    if (dialogOpen && voices.length === 0) {
      fetchVoices();
    }
  }, [dialogOpen]);

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

        // Close dialog and reset form
        setDialogOpen(false);
        setNewPrompt("");
        setTargetDuration(60);
        setSelectedVoiceId("alloy");
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
        }),
      });

      if (res.ok) {
        const newSeries = await res.json();
        setSeriesDialogOpen(false);
        setNewSeriesTitle("");
        setNewSeriesDescription("");
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

  // Format duration in seconds to MM:SS
  function formatDuration(seconds: number | null): string {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function openCreateStoryDialog(seriesId: string | null = null) {
    setSelectedSeriesForCreate(seriesId);
    setDialogOpen(true);
  }

  // Group stories by series
  const storiesBySeries = stories.reduce((acc, story) => {
    const key = story.series_id || 'no-series';
    if (!acc[key]) acc[key] = [];
    acc[key].push(story);
    return acc;
  }, {} as Record<string, Story[]>);

  // Sort stories within each series by created_at (most recent first)
  Object.keys(storiesBySeries).forEach(key => {
    storiesBySeries[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });

  // Story Card Component
  const StoryCard = ({ story, showEpisodeBadge = false }: { story: Story; showEpisodeBadge?: boolean }) => (
    <div className="group cursor-pointer relative">
      <div
        onClick={() => router.push(`/story/${story.id}`)}
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

        {/* Series Badge - Green icon when story is part of a series */}
        {story.series_id && (
          <div className="absolute top-1.5 left-1.5 bg-green-600/90 text-white p-1 rounded">
            <Film className="w-2.5 h-2.5" />
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
              {story.series_id ? (
                <DropdownMenuItem
                  onClick={(e) => handleRemoveFromSeriesClick(e as any, story)}
                  className="text-gray-200 hover:text-white hover:bg-gray-800 cursor-pointer"
                >
                  <List className="w-4 h-4 mr-2" />
                  Remove from series
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => handleAddToSeriesClick(e as any, story)}
                  className="text-gray-200 hover:text-white hover:bg-gray-800 cursor-pointer"
                >
                  <List className="w-4 h-4 mr-2" />
                  Add to series
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => handleDeleteClick(e as any, story.id)}
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
          <h3 className="text-xs font-semibold text-white line-clamp-2 mb-0.5">
            {story.title || "Untitled"}
          </h3>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-300">
            <div className="flex items-center gap-0.5">
              <ImageIcon className="w-2.5 h-2.5" />
              <span>{story.scene_count}</span>
            </div>
            {story.video_duration && (
              <div className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                <span>{formatDuration(story.video_duration)}</span>
              </div>
            )}
            {story.video_url && (
              <div className="flex items-center gap-0.5">
                <span className="text-green-400 font-medium">
                  Ready
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Series Card Component
  const SeriesCard = ({ series: s }: { series: Series }) => {
    const seriesStories = storiesBySeries[s.id] || [];
    const firstStoryImage = seriesStories[0]?.first_scene_image;

    return (
      <div
        onClick={() => setSelectedSeriesView(s)}
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

          {/* Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2">
            <h3 className="text-xs font-semibold text-white line-clamp-2 mb-0.5">
              {s.title}
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-300">
              <div className="flex items-center gap-0.5">
                <Film className="w-2.5 h-2.5" />
                <span>{s.story_count} {s.story_count === 1 ? 'story' : 'stories'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Format duration for display (30s, 1m, 2m, 3m)
  function formatTargetDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    return `${seconds / 60}m`;
  }

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
    <div className="space-y-4 mt-4">
      {/* Story Input with inline Story Type toggle - Only show for AI Generated */}
      {!isBlankStory && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-200">
              Add your story or an idea
            </label>

            {/* Compact Toggle Buttons */}
            <div className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => setIsBlankStory(false)}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                  !isBlankStory
                    ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                AI Generated
              </button>
              <button
                type="button"
                onClick={() => setIsBlankStory(true)}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                  isBlankStory
                    ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                Blank
              </button>
            </div>
          </div>

          <textarea
            placeholder="A young blacksmith forges a sword from fallen stars, awakening an ancient power that will either save the kingdom or doom it forever."
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            rows={4}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder:text-gray-500 text-sm"
          />
        </div>
      )}

      {/* Show toggle for Blank story mode */}
      {isBlankStory && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-200">
            Story Type
          </label>

          {/* Compact Toggle Buttons */}
          <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => setIsBlankStory(false)}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                !isBlankStory
                  ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              AI Generated
            </button>
            <button
              type="button"
              onClick={() => setIsBlankStory(true)}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                isBlankStory
                  ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              Blank
            </button>
          </div>
        </div>
      )}

      {/* Duration - Only show for AI-generated stories */}
      {!isBlankStory && (
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Duration
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[30, 60, 120, 180].map((duration) => {
              const sceneEstimate = Math.max(3, Math.round(duration / 6));
              const isDisabled = creditBalance <= 15 && duration > 30;
              return (
                <button
                  key={duration}
                  type="button"
                  onClick={() => !isDisabled && setTargetDuration(duration as 30 | 60 | 120 | 180)}
                  disabled={isDisabled}
                  className={`p-2 pt-5 rounded-lg border transition-all relative ${
                    targetDuration === duration
                      ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                      : isDisabled
                      ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed opacity-50'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {isDisabled && (
                    <div className="absolute top-0 left-0 right-0 bg-orange-900/30 text-orange-400 text-[9px] font-medium py-0.5 rounded-t-lg text-center">
                      Low credits
                    </div>
                  )}
                  <div className="text-sm font-medium">{formatTargetDuration(duration)}</div>
                  <div className="text-xs opacity-75">({sceneEstimate} scenes)</div>
                </button>
              );
            })}
          </div>
          {creditBalance <= 15 && (
            <p className="text-xs text-orange-400 mt-2">
              You have {creditBalance} credits. Get more credits to create longer stories.
            </p>
          )}
        </div>
      )}

      {/* Format */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          Format
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "9:16", icon: Smartphone, label: "9:16" },
            { value: "16:9", icon: Monitor, label: "16:9" },
            { value: "1:1", icon: Square, label: "1:1" }
          ].map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAspectRatio(value as any)}
              className={`p-2 rounded-lg border transition-all ${
                aspectRatio === value
                  ? 'border-orange-500 bg-orange-500/20'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${aspectRatio === value ? 'text-orange-400' : 'text-gray-400'}`} />
              <div className={`text-xs font-medium ${aspectRatio === value ? 'text-orange-400' : 'text-gray-300'}`}>
                {label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Voice Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          Narrator Voice
        </label>
        {loadingVoices ? (
          <div className="flex items-center justify-center py-8 bg-gray-800 border border-gray-700 rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
            <span className="ml-2 text-sm text-gray-400">Loading voices...</span>
          </div>
        ) : voices.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 max-h-[280px] overflow-y-auto">
            {voices.slice(0, 8).map((voice) => (
              <button
                key={voice.id}
                type="button"
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`p-2.5 rounded-lg border transition-all text-left ${
                  selectedVoiceId === voice.id
                    ? 'border-orange-500 bg-orange-500/20'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                {/* Voice Name */}
                <div className={`text-sm font-medium mb-1 ${
                  selectedVoiceId === voice.id ? 'text-orange-400' : 'text-white'
                }`}>
                  {voice.name}
                </div>

                {/* Voice Tags */}
                {voice.labels && formatVoiceLabels(voice.labels) && (
                  <div className="text-xs text-gray-500 mb-2 line-clamp-2 min-h-[2rem]">
                    {formatVoiceLabels(voice.labels)}
                  </div>
                )}

                {/* Preview Button */}
                {voice.preview_url && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      playVoicePreview(voice.id, voice.preview_url);
                    }}
                    className={`w-full px-2 py-1 rounded text-xs font-medium transition-colors text-center ${
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
          <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 text-center">
            Click to load voices
          </div>
        )}
      </div>

      {/* Info note */}
      <p className="text-xs text-gray-500 text-center">
        All settings adjustable after creation
      </p>

      {/* Create Button */}
      <Button
        disabled={creating || !newPrompt.trim()}
        onClick={createStory}
        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
        size="lg"
      >
        {creating ? (
          <>
            <Loader2 className="animate-spin h-5 w-5 mr-2" /> Creating Story...
          </>
        ) : (
          <>
            <Plus className="w-5 h-5 mr-2" /> Create Story
          </>
        )}
      </Button>
    </div>
  );

  return (
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
                    setMobileMenuOpen(false);
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
                  onClick={() => {
                    setSelectedCategory("series");
                    setSelectedSeriesView(null);
                    setMobileMenuOpen(false);
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
              <div className="bg-gradient-to-br from-orange-600/20 to-pink-600/20 border border-orange-600/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-600/30 flex items-center justify-center">
                      <Coins className="w-4 h-4 text-orange-400" />
                    </div>
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Credits</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  {creditsLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-white">{creditBalance}</span>
                      <span className="text-sm text-gray-400">available</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  1 image or audio = 1 credit
                </p>
                <Button
                  onClick={() => {
                    router.push('/credits');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full mt-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
                >
                  <Coins className="w-4 h-4 mr-2" />
                  Buy Credits
                </Button>
              </div>
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
                    className="flex items-center gap-3 text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
                    onClick={() => {/* Settings functionality can be added later */}}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
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
      <div className="hidden md:flex w-64 bg-gray-950 border-r border-gray-800 flex-col fixed h-full">
        {/* Logo/Brand */}
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-white">Kahaani</h1>
          <p className="text-xs text-gray-500 mt-1">AI Story Studio</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">
              Categories
            </p>
            <button
              onClick={() => setSelectedCategory("faceless-videos")}
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
              onClick={() => {
                setSelectedCategory("series");
                setSelectedSeriesView(null); // Clear selected series view when clicking Series in sidebar
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
          <div className="bg-gradient-to-br from-orange-600/20 to-pink-600/20 border border-orange-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-600/30 flex items-center justify-center">
                  <Coins className="w-4 h-4 text-orange-400" />
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Credits</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              {creditsLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
              ) : (
                <>
                  <span className="text-3xl font-bold text-white">{creditBalance}</span>
                  <span className="text-sm text-gray-400">available</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              1 image or audio = 1 credit
            </p>
            <Button
              onClick={() => router.push('/credits')}
              className="w-full mt-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
            >
              <Coins className="w-4 h-4 mr-2" />
              Buy Credits
            </Button>
          </div>
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
                className="flex items-center gap-3 text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
                onClick={() => {/* Settings functionality can be added later */}}
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </DropdownMenuItem>
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white font-semibold">
                  <Plus className="w-4 h-4 mr-1" /> New
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl bg-gray-900 text-white border-gray-800 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">Create a New Story</DialogTitle>
                </DialogHeader>
                {renderDialogContent()}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stories by Series - Netflix Style */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          {/* Header with Create Buttons */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white">
              {selectedCategory === "series"
                ? selectedSeriesView
                  ? `Series: ${selectedSeriesView.title}`
                  : "Series"
                : "Stories"
              }
            </h1>
            {/* Desktop Create Buttons - Hidden on mobile */}
            <div className="hidden md:flex gap-2">
              <Dialog open={seriesDialogOpen} onOpenChange={setSeriesDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-gray-700">
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

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-orange-600 hover:bg-orange-700">
                    <Plus className="w-4 h-4 mr-2" />
                    New Story
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl bg-gray-900 text-white border-gray-800 max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Create a New Story</DialogTitle>
                  </DialogHeader>
                  {renderDialogContent()}
                </DialogContent>
              </Dialog>
            </div>
          </div>

        {loading ? (
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
              {/* Series Description (if exists) */}
              {selectedSeriesView.description && (
                <div className="mb-6">
                  <p className="text-gray-400">{selectedSeriesView.description}</p>
                </div>
              )}

              {/* Stories from this series */}
              {storiesBySeries[selectedSeriesView.id]?.length === 0 ? (
                <div className="text-center py-20">
                  <div className="mb-6 flex justify-center">
                    <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                      <Film className="w-12 h-12 text-orange-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-4">No stories in this series yet</h3>
                  <p className="text-gray-400 mb-8 max-w-md mx-auto">
                    Create a story and add it to this series
                  </p>
                  <Button onClick={() => openCreateStoryDialog()} className="bg-orange-600 hover:bg-orange-700">
                    <Plus className="w-4 h-4 mr-2" /> Create Story
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {storiesBySeries[selectedSeriesView.id].map((story) => (
                    <StoryCard key={story.id} story={story} showEpisodeBadge={true} />
                  ))}
                </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {series.map((s) => (
                <SeriesCard key={s.id} series={s} />
              ))}
            </div>
          )
        ) : (
          <>
            {/* Filter toggle - right above stories grid */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-series-stories"
                  checked={showSeriesStories}
                  onCheckedChange={(checked) => setShowSeriesStories(checked === true)}
                />
                <label
                  htmlFor="show-series-stories"
                  className="text-sm text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
                >
                  Include stories from series
                </label>
              </div>
              <span className="text-xs text-gray-500">
                {stories.filter(s => showSeriesStories || !s.series_id).length} of {stories.length} stories
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {stories.map((story) => {
                const isVisible = showSeriesStories || !story.series_id;
                return (
                  <div key={story.id} style={{ display: isVisible ? 'block' : 'none' }}>
                    <StoryCard story={story} showEpisodeBadge={!!story.series_id} />
                  </div>
                );
              })}
            </div>

            {/* Show empty state only if no visible stories */}
            {(() => {
              const visibleCount = stories.filter(s => showSeriesStories || !s.series_id).length;
              return visibleCount === 0 ? (
            <div className="text-center py-20">
              <div className="mb-6 flex justify-center">
                <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                  <Film className="w-12 h-12 text-orange-400" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">All your stories are in series</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                Enable "Include stories from series" above to see them here, or visit the Series tab.
              </p>
              <Button onClick={() => setShowSeriesStories(true)} className="bg-orange-600 hover:bg-orange-700">
                Show Stories from Series
              </Button>
            </div>
              ) : null;
            })()}
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
    </div>
  );
}
