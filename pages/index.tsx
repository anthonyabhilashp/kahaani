import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, PlayCircle, Clock, Film, Image as ImageIcon, Video, Settings, User, LogOut, Trash2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";

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

  useEffect(() => {
    // Prevent duplicate fetches (React Strict Mode calls useEffect twice)
    if (hasFetchedRef.current) {
      console.log("⏭️ Skipping duplicate stories fetch");
      return;
    }
    hasFetchedRef.current = true;
    fetchStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchStories() {
    setLoading(true);
    try {
      const res = await fetch("/api/get_stories");
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

  async function createStory() {
    if (!newPrompt.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/generate_scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: newPrompt,
          sceneCount: sceneCount
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const storyId = data.story_id;

        // Close dialog
        setDialogOpen(false);
        setNewPrompt("");

        // Navigate to story page
        if (storyId) {
          router.push(`/story/${storyId}`);
        }
      }
    } catch (error) {
      console.error("Error creating story:", error);
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

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Left Sidebar */}
      <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col fixed h-full">
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
              <span className="font-medium">Faceless Videos</span>
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

        {/* User Profile Section */}
        <div className="border-t border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-3 px-2 py-2 rounded-lg hover:bg-gray-900 cursor-pointer transition-colors">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">User Account</p>
              <p className="text-xs text-gray-500 truncate">user@example.com</p>
            </div>
          </div>

          <div className="space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-900 hover:text-white transition-colors text-sm">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-900 hover:text-red-400 transition-colors text-sm">
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-64">
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Faceless Videos</h2>
                <p className="text-gray-400 text-sm">AI-powered visual storytelling</p>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white font-semibold">
                    <Plus className="w-4 h-4 mr-2" /> New Story
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl bg-gray-900 text-white border-gray-800">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Create a New Story</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 mt-4">
                    {/* Story Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Story Input
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        You can either write your complete story, or give a simple idea and AI will generate scenes for you.
                      </p>
                      <textarea
                        placeholder="E.g., 'A young adventurer discovers a magical compass' or write your full story with all details..."
                        value={newPrompt}
                        onChange={(e) => setNewPrompt(e.target.value)}
                        rows={5}
                        className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder:text-gray-500"
                      />
                    </div>

                    {/* Scene Count Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        Number of Scenes: <span className="text-orange-400 font-bold">{sceneCount}</span>
                      </label>
                      <Slider
                        value={[sceneCount]}
                        onValueChange={(value) => setSceneCount(value[0])}
                        min={3}
                        max={8}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-2">
                        <span>3 scenes</span>
                        <span>8 scenes</span>
                      </div>
                    </div>

                    {/* Example prompts */}
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">Need inspiration? Try these:</p>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          "A cat discovers a secret library where books come alive at night",
                          "Two friends build a time machine and accidentally meet dinosaurs",
                          "A magical paintbrush brings drawings to life in unexpected ways"
                        ].map((example, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setNewPrompt(example)}
                            className="text-left text-xs text-orange-400 hover:text-orange-300 p-2 rounded-md hover:bg-gray-800 transition-colors"
                          >
                            "{example}"
                          </button>
                        ))}
                      </div>
                    </div>

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
                          <Plus className="w-4 h-4 mr-2" /> Generate Story
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Stories Grid */}
        <div className="px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-gray-500">
              {stories.length} {stories.length === 1 ? 'story' : 'stories'}
            </div>
          </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin h-8 w-8 text-orange-500 mr-3" />
            <span className="text-gray-400 text-lg">Loading your stories...</span>
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-8xl mb-6">📚</div>
            <h3 className="text-2xl font-semibold text-white mb-4">No stories yet</h3>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Ready to create your first story? Let your imagination run wild!
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white font-semibold">
                  <Plus className="w-4 h-4 mr-2" /> Create Your First Story
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl bg-gray-900 text-white border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">Create Your First Story</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {/* Story Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Story Input
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      You can either write your complete story, or give a simple idea and AI will generate scenes for you.
                    </p>
                    <textarea
                      placeholder="E.g., 'A young adventurer discovers a magical compass' or write your full story with all details..."
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      rows={5}
                      className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder:text-gray-500"
                    />
                  </div>

                  {/* Scene Count Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Number of Scenes: <span className="text-orange-400 font-bold">{sceneCount}</span>
                    </label>
                    <Slider
                      value={[sceneCount]}
                      onValueChange={(value) => setSceneCount(value[0])}
                      min={3}
                      max={8}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                      <span>3 scenes</span>
                      <span>8 scenes</span>
                    </div>
                  </div>

                  {/* Example prompts */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Need inspiration? Try these:</p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        "A cat discovers a secret library where books come alive at night",
                        "Two friends build a time machine and accidentally meet dinosaurs",
                        "A magical paintbrush brings drawings to life in unexpected ways"
                      ].map((example, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setNewPrompt(example)}
                          className="text-left text-xs text-orange-400 hover:text-orange-300 p-2 rounded-md hover:bg-gray-800 transition-colors"
                        >
                          "{example}"
                        </button>
                      ))}
                    </div>
                  </div>

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
                        <Plus className="w-4 h-4 mr-2" /> Generate Story
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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

                    {/* Duration Badge */}
                    {story.video_duration && (
                      <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(story.video_duration)}
                      </div>
                    )}

                    {/* Video Ready Indicator */}
                    {story.video_url && (
                      <div className="absolute top-2 right-2 bg-green-600/90 backdrop-blur-sm text-white p-1.5 rounded-full">
                        <Film className="w-3 h-3" />
                      </div>
                    )}

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDeleteClick(e, story.id)}
                      className="absolute top-2 left-2 bg-red-600/90 hover:bg-red-700 backdrop-blur-sm text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                      title="Delete story"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Hover Overlay with Play Button */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="bg-orange-600 p-3 rounded-full">
                      <PlayCircle className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>

                {/* Story Info */}
                <div className="mt-3 px-1">
                  <h3 className="text-sm font-semibold text-white line-clamp-2 mb-1 group-hover:text-orange-400 transition-colors">
                    {story.title || "Untitled Story"}
                  </h3>

                  {/* Metrics */}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      <span>{story.scene_count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(story.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
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
