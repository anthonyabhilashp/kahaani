import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Loader2, Film, Clock, Edit, Image as ImageIcon, MoreHorizontal, Trash2, Video, Settings, User, LogOut, Coins } from "lucide-react";
import { useCredits } from "../../hooks/useCredits";
import Image from "next/image";
import { CreateStoryDialog } from "@/components/CreateStoryDialog";
import { toast } from "@/hooks/use-toast";

type SeriesStory = {
  id: string;
  title: string;
  status: string;
  total_duration: number;
  created_at: string;
  updated_at: string;
  first_scene_image: string | null;
  video_url: string | null;
  scene_count: number;
};

type SeriesDetail = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  story_count: number;
  created_at: string;
  updated_at: string;
  episodes: SeriesStory[];
};

export default function SeriesDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, signOut } = useAuth();
  const { balance: creditBalance, loading: creditsLoading } = useCredits();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [updating, setUpdating] = useState(false);
  const [createStoryDialogOpen, setCreateStoryDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [storyToRemove, setStoryToRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (id && user) {
      fetchSeriesDetail();
    }
  }, [id, user]);

  async function fetchSeriesDetail() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch(`/api/series/${id}`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Failed to fetch series:", {
          status: res.status,
          error: errorData
        });
        toast({
          description: `Failed to load series: ${errorData.error || errorData.message || res.status}`,
          variant: "destructive"
        });
        return;
      }

      const data = await res.json();
      setSeries(data);
      setEditTitle(data.title);
      setEditDescription(data.description || "");
    } catch (err) {
      console.error("Error fetching series:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSeries() {
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/series/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
        }),
      });

      if (res.ok) {
        await fetchSeriesDetail();
        setEditDialogOpen(false);
        toast({ description: "Series updated successfully" });
      } else {
        const error = await res.json();
        toast({ description: `Failed to update series: ${error.error}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error updating series:", error);
      toast({ description: "Failed to update series", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  }

  async function removeStoryFromSeries() {
    if (!storyToRemove) return;

    setRemoving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/series/add_story`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          story_id: storyToRemove,
          series_id: null, // Set to null to remove from series
        }),
      });

      if (res.ok) {
        // Refresh series data
        await fetchSeriesDetail();
        setRemoveDialogOpen(false);
        setStoryToRemove(null);
        toast({ description: "Story removed from series" });
      } else {
        const error = await res.json();
        toast({ description: `Failed to remove story: ${error.error}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error removing story:", error);
      toast({ description: "Failed to remove story from series", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        Series not found
      </div>
    );
  }

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
              onClick={() => router.push("/")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-gray-400 hover:bg-gray-900 hover:text-white"
            >
              <Video className="w-5 h-5" />
              <span className="font-medium">Stories</span>
            </button>

            <button
              onClick={() => router.push("/?category=series")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mt-1 bg-orange-600 text-white"
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
              onClick={() => router.push("/")}
              className="text-sm text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <Button
              onClick={() => setCreateStoryDialogOpen(true)}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Story
            </Button>
          </div>
        </div>

        {/* Top Header - Desktop */}
        <header className="hidden md:block bg-black border-b border-gray-800">
          <div className="px-3 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2 md:gap-6">
            {/* Left side: Title + Back Link */}
            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
              {/* Title + Back Link (vertical stack) */}
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm md:text-lg font-semibold text-white truncate">
                    {series.title}
                  </h1>
                  <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogTrigger asChild>
                      <button className="p-1.5 md:p-2 bg-gray-800 hover:bg-orange-600 text-gray-400 hover:text-white rounded transition-colors flex-shrink-0">
                        <Edit className="w-3 h-3 md:w-4 md:h-4" />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
                      <DialogHeader>
                        <DialogTitle>Edit Series</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Title</label>
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="bg-gray-800 border-gray-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Description</label>
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md"
                            rows={3}
                          />
                        </div>
                        <Button
                          onClick={updateSeries}
                          disabled={updating}
                          className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                          {updating ? "Updating..." : "Update Series"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <button
                  onClick={() => router.push("/?category=series")}
                  className="text-xs text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1 w-fit"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to Series</span>
                </button>
              </div>
            </div>

            {/* Right side: Add Story Button */}
            <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
              <Button
                onClick={() => setCreateStoryDialogOpen(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm"
              >
                <Plus className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
                <span className="hidden md:inline">Add Story</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Series Content */}
        <div className="flex-1 bg-gray-950">
          <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Stories Grid */}
        <div>
          {series.episodes.length === 0 ? (
            <div className="text-center py-20">
              <div className="mb-6 flex justify-center">
                <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                  <Film className="w-16 h-16 text-orange-400" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">No stories yet</h3>
              <p className="text-gray-400 max-w-md mx-auto">Click "Add Story" above to create your first story</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {series.episodes.map((episode, index) => {
                // Calculate episode number: most recent first, so reverse the index
                const episodeNumber = series.episodes.length - index;
                return (
                  <div
                    key={episode.id}
                    className="group cursor-pointer relative"
                  >
                    <div
                      onClick={() => router.push(`/story/${episode.id}`)}
                      className="relative rounded-md overflow-hidden bg-gray-900 border border-gray-800 hover:border-orange-600 transition-all duration-200 aspect-[9/16]"
                    >
                      {episode.first_scene_image ? (
                        <Image
                          src={episode.first_scene_image}
                          alt={episode.title || "Episode"}
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
                      <div className="absolute top-1.5 left-1.5 bg-orange-900/90 text-orange-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                        EP {episodeNumber}
                      </div>

                      {/* Video Ready Badge */}
                      {episode.video_url && (
                        <div className="absolute top-1.5 left-14 bg-green-600/90 text-white p-1 rounded">
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
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setStoryToRemove(episode.id);
                                setRemoveDialogOpen(true);
                              }}
                              className="text-red-400 hover:text-red-300 hover:bg-gray-800 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove from series
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                    {/* Info Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2">
                      <h3 className="text-xs font-semibold text-white line-clamp-2 mb-0.5">
                        {episode.title || "Untitled"}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-300">
                        <div className="flex items-center gap-0.5">
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>{episode.scene_count}</span>
                        </div>
                        {episode.total_duration > 0 && (
                          <div className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatDuration(episode.total_duration)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
          </div>
        </div>

        {/* Create Story Dialog */}
        <CreateStoryDialog
          open={createStoryDialogOpen}
          onOpenChange={setCreateStoryDialogOpen}
          seriesId={id as string}
          onStoryCreated={fetchSeriesDetail}
        />

        {/* Remove Story Confirmation Dialog */}
        <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Remove Story from Series</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-2">
              <p className="text-gray-300 text-sm leading-relaxed">
                This story will be removed from the series but will remain in your library.
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => {
                    setRemoveDialogOpen(false);
                    setStoryToRemove(null);
                  }}
                  disabled={removing}
                  variant="outline"
                  className="flex-1 bg-gray-800 border-gray-700 hover:bg-gray-700 text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={removeStoryFromSeries}
                  disabled={removing}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {removing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    "Remove"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
