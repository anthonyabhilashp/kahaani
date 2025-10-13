import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Play, Pause, Download, Volume2, ChevronDown, Maximize, Loader2 } from "lucide-react";

type Scene = { id?: string; text: string };
type Image = { image_url: string; scene_order: number };
type Audio = { audio_url: string };
type Video = { video_url: string };

export default function StoryDetailsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [story, setStory] = useState<any>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);

  const fetchStory = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/get_story_details?id=${id}`);
      const data = await res.json();
      setStory(data.story);
      setScenes(data.scenes || []);
      setImages(data.images || []);
      setAudio(data.audio);
      setVideo(data.video);
    } catch (err) {
      console.error("Error fetching story:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStory();
  }, [fetchStory]);

  const generateAudio = async () => {
    if (!id) return;
    setGeneratingAudio(true);
    try {
      const res = await fetch("/api/generate_audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_id: id }),
      });
      if (!res.ok) throw new Error("Audio generation failed");
      await fetchStory();
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingAudio(false);
    }
  };

  const generateVideo = async () => {
    if (!id) return;
    setGeneratingVideo(true);
    try {
      const res = await fetch("/api/generate_video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_id: id }),
      });
      if (!res.ok) throw new Error("Video generation failed");
      await fetchStory();
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingVideo(false);
    }
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/20 shadow-sm">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                ✨ {story?.title || "Untitled Story"}
              </h1>
              <p className="text-gray-600 text-sm line-clamp-2 max-w-2xl">
                {story?.prompt}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="flex items-center gap-2 hover:bg-purple-50 hover:border-purple-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Stories
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Scenes Sidebar */}
        <aside className="w-[500px] border-r border-white/20 bg-white/80 backdrop-blur-sm shadow-lg overflow-y-auto">
          <div className="sticky top-0 bg-white/90 backdrop-blur-sm p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">🎬</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Scenes</h2>
                  <p className="text-sm text-gray-500">
                    {scenes.length} magical moments
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="hover:bg-purple-50 hover:border-purple-200">
                ✨ Regenerate
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {scenes.map((scene, index) => (
              <Card
                key={scene.id || index}
                onClick={() => setSelectedScene(index)}
                className={`relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg ${
                  selectedScene === index
                    ? "ring-2 ring-purple-400 shadow-xl bg-gradient-to-r from-purple-50 to-pink-50"
                    : "hover:shadow-md hover:scale-[1.02]"
                }`}
              >
                {/* Scene Number Badge */}
                <div className={`absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-lg z-10 ${
                  selectedScene === index
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                    : "bg-white text-gray-700 border-2 border-gray-200"
                }`}>
                  {index + 1}
                </div>

                <div className="flex gap-4 p-4">
                  {/* Thumbnail */}
                  <div className="relative flex-shrink-0">
                    <img
                      src={images[index]?.image_url || "/placeholder.png"}
                      alt={`Scene ${index + 1}`}
                      className="w-24 h-32 object-cover rounded-lg shadow-md border border-gray-200"
                    />
                    {images[index]?.image_url && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg"></div>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 pt-2">
                    <p className="text-sm leading-relaxed text-gray-700 line-clamp-4 mb-2">
                      {scene.text}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-1 rounded-full">
                        Scene {index + 1}
                      </span>
                      {images[index]?.image_url && (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          ✓ Image Ready
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 relative overflow-hidden">
          {/* Background Elements */}
          <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

          <div className="relative z-10 flex flex-col items-center justify-center">
            {video?.video_url ? (
              <div className="flex flex-col items-center justify-center">
                <div className="relative group">
                  <video
                    key={video.video_url}
                    src={video.video_url}
                    controls
                    className="rounded-3xl shadow-2xl border-2 border-white/20 w-[600px] h-[600px] object-cover backdrop-blur-sm"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent rounded-3xl pointer-events-none"></div>
                </div>
                <div className="mt-6 flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-full px-6 py-3 border border-white/20">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-white text-sm font-medium">Video Ready</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                {images[selectedScene]?.image_url ? (
                  <div className="relative group">
                    <img
                      src={images[selectedScene].image_url}
                      alt="Scene preview"
                      className="rounded-3xl shadow-2xl border-2 border-white/20 w-[600px] h-[600px] object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent rounded-3xl"></div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 border border-white/20">
                        <p className="text-white text-sm line-clamp-2">
                          {scenes[selectedScene]?.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl w-[600px] h-[600px] bg-white/10 backdrop-blur-md border-2 border-white/20 flex flex-col items-center justify-center text-white/70 shadow-2xl">
                    <div className="w-24 h-24 mb-6 bg-white/10 rounded-full flex items-center justify-center">
                      <span className="text-4xl">🎬</span>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Ready to Create Magic</h3>
                    <p className="text-white/50 text-center max-w-sm">
                      Generate your story video to bring this scene to life
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
            <Button
              variant="secondary"
              onClick={generateAudio}
              disabled={generatingAudio}
              className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 shadow-lg px-6 py-3 rounded-full"
            >
              {generatingAudio ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Audio...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Generate Audio
                </div>
              )}
            </Button>
            <Button
              onClick={generateVideo}
              disabled={generatingVideo}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-0 shadow-lg px-6 py-3 rounded-full text-white font-medium"
            >
              {generatingVideo ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering Video...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Generate Video
                </div>
              )}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
