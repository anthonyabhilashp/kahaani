import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, PlayCircle, Clock, Film, Image as ImageIcon, Video, Settings, User, LogOut, Trash2, MoreHorizontal, Smartphone, Square, Monitor, Coins } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LandingPage } from "@/components/LandingPage";
import { useCredits } from "../hooks/useCredits";

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
};

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { balance: creditBalance, loading: creditsLoading } = useCredits();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("faceless-videos");
  const [sceneCount, setSceneCount] = useState(5);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const hasFetchedRef = useRef(false);

  // New story creation options
  const [targetDuration, setTargetDuration] = useState<30 | 60 | 120 | 180>(
    creditBalance <= 15 ? 30 : 60
  ); // in seconds - default to 30s if low credits
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("21m00Tcm4TlvDq8ikWAM"); // Rachel - default
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

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
    if (!newPrompt.trim()) return;
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
          prompt: newPrompt,
          sceneCount: sceneCount,
          voice_id: selectedVoiceId,
          aspect_ratio: aspectRatio
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const storyId = data.story_id;

        // Close dialog and reset form
        setDialogOpen(false);
        setNewPrompt("");
        setTargetDuration(60);
        setSelectedVoiceId("21m00Tcm4TlvDq8ikWAM");
        setAspectRatio("9:16");

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

  // Format duration in seconds to MM:SS
  function formatDuration(seconds: number | null): string {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

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
      {/* Story Input */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          Story Idea
        </label>
        <textarea
          placeholder="E.g., 'A young adventurer discovers a magical compass that leads to hidden treasures'"
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          rows={4}
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder:text-gray-500 text-sm"
        />
      </div>

      {/* Duration */}
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
      {/* Left Sidebar - Hidden on mobile */}
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

            {/* Placeholder for future categories */}
            <button
              disabled
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 cursor-not-allowed mt-1"
            >
              <Film className="w-5 h-5" />
              <span className="font-medium">Series</span>
              <span className="ml-auto text-xs bg-gray-800 px-2 py-0.5 rounded">Soon</span>
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
              1 story = 10 credits
            </p>
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

        {/* Stories Grid */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-gray-500">
              {stories.length} {stories.length === 1 ? 'story' : 'stories'}
            </div>
            {/* Desktop Create Button - Hidden on mobile */}
            <div className="hidden md:block">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="default" className="bg-orange-600 hover:bg-orange-700 text-white font-semibold">
                    <Plus className="w-4 h-4 mr-2" /> Create new story
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
            <span className="text-gray-400 text-lg">Loading your stories...</span>
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
              Ready to create your first story? Let your imagination run wild!
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white font-semibold">
                  <Plus className="w-4 h-4 mr-2" /> Create new story
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl bg-gray-900 text-white border-gray-800 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">Create Your First Story</DialogTitle>
                </DialogHeader>
                {renderDialogContent()}
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {stories.map((story) => (
              <div
                key={story.id}
                className="group cursor-pointer"
                onClick={() => router.push(`/story/${story.id}`)}
              >
                {/* Thumbnail Card */}
                <div className="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-700 transition-all duration-200">
                  {/* Portrait Thumbnail */}
                  <div className="relative w-full aspect-[9/16] bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden">
                    {story.first_scene_image ? (
                      <img
                        src={story.first_scene_image}
                        alt={story.title || "Story thumbnail"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <ImageIcon className="w-12 h-12" />
                      </div>
                    )}

                    {/* Story Info Overlay at Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3 pt-8">
                      <h3 className="text-sm font-semibold text-white line-clamp-2 mb-2 group-hover:text-orange-400 transition-colors">
                        {story.title || "Untitled Story"}
                      </h3>

                      {/* Metrics */}
                      <div className="flex items-center justify-between text-xs text-gray-300">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
                            <span>{story.scene_count}</span>
                          </div>
                          {story.video_duration && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{formatDuration(story.video_duration)}</span>
                            </div>
                          )}
                        </div>
                        {story.video_url && (
                          <div className="bg-green-600/90 text-white px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                            <Film className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Three-dot Menu */}
                    <div className="absolute top-2 right-2 z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white p-1 rounded-full transition-colors"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteClick(e, story.id)}
                            className="text-red-400 focus:text-red-400 focus:bg-red-950/50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Story
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Hover Overlay with Play Button */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="bg-orange-600 p-3 rounded-full">
                      <PlayCircle className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Deleting...
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
    </div>
  );
}
