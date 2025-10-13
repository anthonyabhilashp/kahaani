import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, PlayCircle } from "lucide-react";

type Story = {
  id: string;
  title: string | null;
  prompt: string;
  created_at: string;
  status: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchStories();
  }, []);

  async function fetchStories() {
    setLoading(true);
    const res = await fetch("/api/get_stories");
    const data = await res.json();
    setStories(data || []);
    setLoading(false);
  }

  async function createStory() {
    if (!newPrompt.trim()) return;
    setCreating(true);

    const res = await fetch("/api/generate_scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: newPrompt }),
    });

    if (res.ok) {
      await fetchStories();
      setNewPrompt("");
    }

    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-6xl mx-auto px-8 py-16">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="text-6xl">✨</div>
              <h1 className="text-5xl font-bold text-white tracking-tight">
                Kahaani
              </h1>
            </div>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Transform your imagination into magical stories with AI-powered scenes, stunning visuals, and immersive audio
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-white text-purple-600 hover:bg-blue-50 font-semibold px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                  <Plus className="w-5 h-5 mr-2" /> Create Your Story
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-center mb-2">✨ Create a New Story</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tell us your story idea...
                    </label>
                    <textarea
                      placeholder="A young adventurer discovers a magical compass that leads to hidden worlds..."
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      rows={4}
                      className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  
                  {/* Example prompts */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">💡 Need inspiration? Try these:</p>
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
                          className="text-left text-xs text-blue-600 hover:text-blue-800 p-2 rounded-md hover:bg-blue-50 transition-colors"
                        >
                          "{example}"
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    disabled={creating || !newPrompt.trim()}
                    onClick={createStory}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 rounded-lg shadow-lg transition-all duration-300"
                    size="lg"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="animate-spin h-5 w-5 mr-2" /> Creating Magic...
                      </>
                    ) : (
                      <>
                        ✨ Generate Story Scenes
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Stories Section */}
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Your Stories</h2>
            <p className="text-gray-600">Continue your creative journey</p>
          </div>
          <div className="text-sm text-gray-500">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin h-8 w-8 text-purple-600 mr-3" />
            <span className="text-gray-600 text-lg">Loading your stories...</span>
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-8xl mb-6">📚</div>
            <h3 className="text-2xl font-semibold text-gray-800 mb-4">No stories yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Ready to create your first magical story? Let your imagination run wild!
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold px-8 py-3 rounded-full shadow-lg">
                  <Plus className="w-5 h-5 mr-2" /> Create Your First Story
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-center mb-2">✨ Create Your First Story</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tell us your story idea...
                    </label>
                    <textarea
                      placeholder="A young adventurer discovers a magical compass that leads to hidden worlds..."
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      rows={4}
                      className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <Button
                    disabled={creating || !newPrompt.trim()}
                    onClick={createStory}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 rounded-lg shadow-lg transition-all duration-300"
                    size="lg"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="animate-spin h-5 w-5 mr-2" /> Creating Magic...
                      </>
                    ) : (
                      <>
                        ✨ Generate Story Scenes
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {stories.map((story) => (
              <Card
                key={story.id}
                className="group hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-white/80 backdrop-blur-sm cursor-pointer transform hover:scale-[1.02] hover:-translate-y-1"
                onClick={() => router.push(`/story/${story.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900 line-clamp-2 pr-2">
                      {story.title || "Untitled Story"}
                    </CardTitle>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${story.status === "ready" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {story.status}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600 line-clamp-3 mb-4 leading-relaxed">
                    {story.prompt}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <span>Created {new Date(story.created_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-purple-600">📖</span>
                      <span>Story</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full group-hover:bg-purple-50 group-hover:border-purple-200 group-hover:text-purple-700 transition-all duration-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/story/${story.id}`);
                    }}
                  >
                    <PlayCircle className="w-4 h-4 mr-2" /> Continue Story
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
