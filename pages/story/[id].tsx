import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Play, Pause, Download, Volume2, VolumeX, ChevronDown, Maximize, Loader2, ImageIcon, Image, Edit2, Trash2, Save, X, Check } from "lucide-react";

type Scene = { 
  id?: string; 
  text: string; 
  order: number;
  image_url?: string;
  audio_url?: string;
};
type Video = { video_url: string };

// Placeholder component for missing images
const ImagePlaceholder = ({ className = "", alt = "No image" }: { className?: string; alt?: string }) => (
  <div className={`${className} bg-gray-100 border border-gray-200 flex flex-col items-center justify-center text-gray-400`}>
    <ImageIcon size={16} />
    <span className="text-[8px] mt-1 font-medium">No Image</span>
  </div>
);

// Video component that handles different aspect ratios
const VideoPlayer = ({ src, className }: { src: string; className?: string }) => {
  return (
    <video
      key={src}
      src={src}
      controls
      className={`rounded-xl shadow-2xl border-2 border-white/20 ${className || ''}`}
      style={{ 
        maxWidth: '480px', 
        maxHeight: '480px',
        width: 'auto',
        height: 'auto'
      }}
      onLoadedMetadata={(e) => {
        const video = e.target as HTMLVideoElement;
        console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
        console.log(`Aspect ratio: ${(video.videoWidth / video.videoHeight).toFixed(2)}`);
      }}
    />
  );
};

export default function StoryDetailsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [story, setStory] = useState<any>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [video, setVideo] = useState<Video | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingSceneAudio, setGeneratingSceneAudio] = useState<Set<number>>(new Set());
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [modifiedScenes, setModifiedScenes] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<number | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [volume, setVolume] = useState(0); // Start muted
  const [isVolumeVisible, setIsVolumeVisible] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.7); // Remember last volume setting
  const [mediaPreloaded, setMediaPreloaded] = useState(false);
  const [preloadedAudio, setPreloadedAudio] = useState<{[key: number]: HTMLAudioElement}>({});
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  
  // Use ref for immediate cancellation without state delays
  const previewCancelledRef = useRef(false);
  const currentPreviewRef = useRef<Promise<void> | null>(null);

  // Update volume for all preloaded audio when volume changes
  useEffect(() => {
    Object.values(preloadedAudio).forEach(audio => {
      audio.volume = volume;
    });
  }, [volume, preloadedAudio]);

  // Get preview dimensions based on aspect ratio - MUCH LARGER
  const getPreviewDimensions = () => {
    const maxWidth = 600; // Significantly increased from 400
    const maxHeight = 680; // Significantly increased from 450
    
    switch (aspectRatio) {
      case "9:16": // Portrait (mobile/vertical)
        return { width: Math.min(maxWidth * 0.75, 450), height: Math.min(maxHeight, 800) };
      case "16:9": // Landscape (desktop/horizontal)
        return { width: maxWidth, height: Math.min(maxHeight * 0.56, 340) };
      case "1:1": // Square
        return { width: Math.min(maxWidth * 0.85, 510), height: Math.min(maxHeight * 0.75, 510) };
      default:
        return { width: 600, height: 450 };
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
      
      setStory(data.story);
      setScenes(data.scenes || []);
      setVideo(data.video);
      
      // Preload media assets after setting state - only if not already preloaded
      if (data.scenes?.length > 0 && !mediaPreloaded) {
        preloadMedia(data.scenes);
      }
      
    } catch (err) {
      console.error("❌ Error fetching story:", err);
    } finally {
      setLoading(false);
    }
  }, [id, preloadMedia, mediaPreloaded]);

  // Fetch story only once when component mounts or id changes
  useEffect(() => {
    if (id) {
      fetchStory();
    }
  }, [fetchStory]); // Now properly depend on fetchStory

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

  const generateImages = async () => {
    if (!id) return;
    setGeneratingImages(true);
    try {
      console.log("Starting image generation for story:", id);
      const res = await fetch("/api/generate_images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_id: id }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Image generation failed");
      }
      const result = await res.json();
      console.log("✅ Image generation completed:", result);
      
      // Instead of full refresh, just update images without losing audio cache
      const res2 = await fetch(`/api/get_story_details?id=${id}`);
      const data = await res2.json();
      
      // Update scenes while preserving existing audio cache
      const updatedScenes = data.scenes || [];
      setScenes(updatedScenes);
      
      // Don't reset media preload state or re-preload audio
    } catch (err) {
      console.error("Image generation error:", err);
      alert(`Image generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGeneratingImages(false);
    }
  };

  const generateSceneAudio = async (sceneIndex: number) => {
    if (!scenes[sceneIndex]) return;
    
    const newGenerating = new Set(generatingSceneAudio);
    newGenerating.add(sceneIndex);
    setGeneratingSceneAudio(newGenerating);
    
    try {
      console.log("Starting audio generation for scene:", sceneIndex);
      const res = await fetch("/api/generate_audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          scene_id: scenes[sceneIndex].id
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Scene audio generation failed");
      }
      const result = await res.json();
      console.log("Scene audio generation completed:", result);
      
      // Update the specific scene with the new audio URL
      const updatedScenes = [...scenes];
      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        audio_url: result.audio_url
      };
      setScenes(updatedScenes);
      
      // Update preloaded audio cache with new audio
      if (result.audio_url) {
        const audioElement = new Audio(result.audio_url);
        audioElement.preload = 'metadata';
        audioElement.oncanplaythrough = () => {
          setPreloadedAudio(prev => ({
            ...prev,
            [sceneIndex]: audioElement
          }));
          console.log(`✅ New audio preloaded for scene ${sceneIndex + 1}`);
        };
      }
      
    } catch (err) {
      console.error("Scene audio generation error:", err);
      alert(`Scene audio generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      const newGenerating = new Set(generatingSceneAudio);
      newGenerating.delete(sceneIndex);
      setGeneratingSceneAudio(newGenerating);
    }
  };

  const stopVideoPreview = () => {
    console.log("🛑 Stopping video preview");
    previewCancelledRef.current = true; // Signal all running previews to stop immediately
    setIsPlayingPreview(false);
    
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
  };

  const startVideoPreview = async () => {
    console.log("🎬 Starting video preview from scene:", selectedScene);
    
    // Stop any existing preview first
    stopVideoPreview();
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Reset cancellation flag and start new preview
    previewCancelledRef.current = false;
    setIsPlayingPreview(true);
    
    const playScene = async (sceneIndex: number) => {
      if (previewCancelledRef.current) return false;
      
      console.log(`🎬 Playing scene ${sceneIndex + 1}`);
      setSelectedScene(sceneIndex);
      
      const scene = scenes[sceneIndex];
      if (scene?.audio_url && preloadedAudio[sceneIndex]) {
        console.log(`🔊 Playing preloaded audio for scene ${sceneIndex + 1}`);
        const audio = preloadedAudio[sceneIndex];
        audio.volume = volume;
        audio.currentTime = 0;
        
        try {
          await audio.play();
          await new Promise<void>((resolve) => {
            const checkCancellation = () => {
              if (previewCancelledRef.current) {
                audio.pause();
                resolve();
                return;
              }
              setTimeout(checkCancellation, 100);
            };
            
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            setTimeout(() => {
              audio.pause();
              resolve();
            }, 10000); // Max 10 seconds
            
            checkCancellation();
          });
        } catch (err) {
          console.error("Audio play error:", err);
          // Fallback timing with cancellation check
          for (let i = 0; i < 30 && !previewCancelledRef.current; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header - Compact */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/20 shadow-sm">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                ✨ {story?.title || "Untitled Story"}
              </h1>
              <p className="text-gray-600 text-xs line-clamp-1 max-w-xl">
                {story?.prompt}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/")}
              className="flex items-center gap-1 hover:bg-purple-50 hover:border-purple-200 ml-2"
            >
              <ArrowLeft className="w-3 h-3" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Scenes - Restore proper width */}
        <aside className="w-[460px] border-r border-white/20 bg-white/80 backdrop-blur-sm shadow-lg overflow-y-auto">
          <div className="sticky top-0 bg-white/90 backdrop-blur-sm p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-white text-sm">🎬</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Scenes</h2>
                <p className="text-xs text-gray-500">{scenes.length} moments</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {scenes.map((scene, index) => (
              <Card
                key={scene.id || index}
                onClick={() => {
                  stopVideoPreview(); // Stop any existing preview
                  setSelectedScene(index);
                }}
                className={`group relative overflow-hidden transition-all duration-500 cursor-pointer border-2 shadow-lg hover:shadow-xl ${
                  selectedScene === index
                    ? "ring-4 ring-purple-300/50 shadow-2xl bg-gradient-to-br from-purple-50 via-white to-pink-50 border-purple-300 scale-[1.02]"
                    : "hover:shadow-xl hover:scale-[1.01] bg-white border-gray-200/60 hover:border-gray-300"
                } ${modifiedScenes.has(index) ? "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50" : ""}`}
              >
                {/* Scene Number Badge - Enhanced */}
                <div className={`absolute top-4 left-4 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-xl z-20 border-2 transition-all duration-300 ${
                  selectedScene === index && isPlayingPreview
                    ? "bg-gradient-to-br from-emerald-500 to-cyan-500 text-white animate-pulse border-white/50 shadow-emerald-500/25"
                    : selectedScene === index
                    ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white border-white/50 shadow-purple-500/25"
                    : modifiedScenes.has(index)
                    ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-white/50 shadow-amber-500/25"
                    : "bg-white/95 text-gray-700 border-gray-200 shadow-gray-200/50 backdrop-blur-sm"
                }`}>
                  {selectedScene === index && isPlayingPreview ? '▶' : index + 1}
                </div>

                {/* Edit/Delete Icons - Enhanced */}
                {editingScene !== index && (
                  <div className="absolute top-4 right-4 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingScene(index);
                        setEditText(scene.text);
                      }}
                      className="w-9 h-9 rounded-xl bg-white/95 hover:bg-blue-50 text-gray-600 hover:text-blue-600 shadow-lg border border-gray-200/80 backdrop-blur-sm transition-all duration-300 hover:scale-110"
                      title="Edit scene"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(index);
                      }}
                      className="w-9 h-9 rounded-xl bg-white/95 hover:bg-red-50 text-gray-600 hover:text-red-600 shadow-lg border border-gray-200/80 backdrop-blur-sm transition-all duration-300 hover:scale-110"
                      title="Delete scene"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                <div className="flex gap-6 p-6">
                  {/* Thumbnail - Enhanced */}
                  <div className="relative flex-shrink-0">
                    {scene.image_url ? (
                      <div className="w-36 h-36 rounded-2xl overflow-hidden shadow-xl border-2 border-gray-200/60 bg-gray-50 ring-1 ring-gray-200/50">
                        <img
                          src={scene.image_url}
                          alt={`Scene ${index + 1}`}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="w-36 h-36 rounded-2xl shadow-xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center transition-all duration-300 group-hover:border-gray-400">
                        <Image className="w-12 h-12 text-gray-400 mb-2" />
                        <span className="text-xs text-gray-500 font-medium">No Image</span>
                      </div>
                    )}
                  </div>

                  {/* Text Content - Enhanced */}
                  <div className="flex-1 pt-3">
                    {editingScene === index ? (
                      <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full text-sm p-4 border-2 border-gray-200 rounded-xl resize-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-300 bg-white shadow-sm"
                          rows={4}
                          autoFocus
                          placeholder="Enter scene description..."
                        />
                        <div className="flex gap-3">
                          <Button
                            onClick={() => editScene(index, editText)}
                            size="sm"
                            className="h-9 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Save Changes
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingScene(null);
                              setEditText("");
                            }}
                            className="h-9 px-4 text-sm rounded-xl border-2 hover:bg-gray-50 transition-all duration-300"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed text-gray-700 line-clamp-5 mb-4 font-medium">
                          {scene.text}
                        </p>
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="bg-gradient-to-r from-gray-100 to-gray-200 px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 shadow-sm border border-gray-200/80">
                            Scene {index + 1}
                          </span>
                          
                          {/* Audio Status - Enhanced badges */}
                          {scene.audio_url ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (preloadedAudio[index]) {
                                  const audio = preloadedAudio[index];
                                  audio.volume = volume; // Apply current volume setting
                                  audio.currentTime = 0;
                                  audio.play().catch(console.error);
                                } else {
                                  const audio = new Audio(scene.audio_url!);
                                  audio.volume = volume; // Apply current volume setting
                                  audio.play().catch(console.error);
                                }
                              }}
                              className="bg-gradient-to-r from-emerald-100 to-green-100 hover:from-emerald-200 hover:to-green-200 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2 transition-all duration-300 shadow-sm border border-emerald-200/80 font-medium"
                              title="Play audio"
                            >
                              <Volume2 className="w-4 h-4" />
                              Audio Ready
                            </Button>
                          ) : generatingSceneAudio.has(index) ? (
                            <span className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-sm border border-blue-200/80 font-medium">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Generating...
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                generateSceneAudio(index);
                              }}
                              className="bg-gradient-to-r from-blue-100 to-indigo-100 hover:from-blue-200 hover:to-indigo-200 text-blue-700 px-4 py-2 rounded-xl transition-all duration-300 shadow-sm border border-blue-200/80 font-medium"
                              title="Generate audio"
                            >
                              + Generate Audio
                            </Button>
                          )}
                          
                          {modifiedScenes.has(index) && (
                            <span className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 px-4 py-2 rounded-xl text-sm shadow-sm border border-amber-200/80 font-medium">
                              ⚠ Modified
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </aside>

        {/* Main Content - Minimal empty space */}
        <main className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 relative overflow-hidden py-2">
          {/* Minimal Background Elements */}
          <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20"></div>
          <div className="absolute top-1/4 left-1/4 w-20 h-20 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-20 h-20 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-1/4 left-1/3 w-20 h-20 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-blob animation-delay-4000"></div>

          {/* Main Preview Area - Maximum compact */}
          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-lg px-4">
            {/* Aspect Ratio Controls - Compact */}
            <div className="mb-1 flex items-center gap-2">
              <label className="text-white text-xs font-medium">Aspect:</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as "9:16" | "16:9" | "1:1")}
                className="bg-white/20 backdrop-blur-sm border border-white/30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
              >
                <option value="9:16" className="text-gray-900">9:16</option>
                <option value="16:9" className="text-gray-900">16:9</option>
                <option value="1:1" className="text-gray-900">1:1</option>
              </select>
            </div>

            {/* Always show scene-based preview, with option to view generated video */}
            <div className="flex flex-col items-center justify-center video-preview-container">
              {scenes[selectedScene]?.image_url ? (
                  <div className="relative group">
                    <div 
                      className="rounded-xl shadow-2xl border-2 border-white/20 overflow-hidden bg-gray-900"
                      style={{
                        width: `${getPreviewDimensions().width}px`,
                        height: `${getPreviewDimensions().height}px`
                      }}
                    >
                      <img
                        src={scenes[selectedScene].image_url}
                        alt="Scene preview"
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Video Controls Overlay - Compact */}
                      {/* Video Controls Overlay - Enhanced & Bigger */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-all duration-500">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Play/Pause Button - Bigger & Smoother */}
                            <Button
                              size="lg"
                              onClick={isPlayingPreview ? stopVideoPreview : startVideoPreview}
                              className="w-14 h-14 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl flex items-center justify-center transition-all duration-300 border border-white/40 shadow-2xl hover:scale-110 hover:shadow-white/20"
                            >
                              {isPlayingPreview ? (
                                <Pause className="w-6 h-6 text-white" />
                              ) : (
                                <Play className="w-6 h-6 text-white ml-1" />
                              )}
                            </Button>
                            
                            {/* Volume Control - Enhanced */}
                            <div 
                              className="relative"
                              onMouseLeave={() => setIsVolumeVisible(false)}
                            >
                              <Button
                                size="lg"
                                onMouseEnter={() => setIsVolumeVisible(true)}
                                onClick={() => {
                                  if (volume === 0) {
                                    setVolume(lastVolume);
                                  } else {
                                    setLastVolume(volume);
                                    setVolume(0);
                                  }
                                }}
                                className="w-12 h-12 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-xl flex items-center justify-center transition-all duration-300 border border-white/30 shadow-xl hover:scale-110"
                              >
                                {volume === 0 ? (
                                  <VolumeX className="w-5 h-5 text-white" />
                                ) : (
                                  <Volume2 className="w-5 h-5 text-white" />
                                )}
                              </Button>
                              
                              {/* Volume Slider - Enhanced */}
                              {isVolumeVisible && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 bg-black/95 backdrop-blur-md rounded-xl p-4 border border-white/20 shadow-2xl">
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={volume}
                                    onChange={(e) => {
                                      const newVolume = parseFloat(e.target.value);
                                      setVolume(newVolume);
                                      if (newVolume > 0) {
                                        setLastVolume(newVolume);
                                      }
                                    }}
                                    className="w-20 h-2 bg-white/20 rounded-full appearance-none cursor-pointer slider hover:bg-white/30 transition-all duration-300"
                                    style={{
                                      background: `linear-gradient(to right, #ffffff ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Right side controls - Enhanced */}
                          <div className="flex items-center gap-3">
                            {/* Fullscreen Button - Bigger */}
                            <Button
                              size="lg"
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
                              className="w-12 h-12 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-xl flex items-center justify-center transition-all duration-300 border border-white/30 shadow-xl hover:scale-110"
                            >
                              <Maximize className="w-5 h-5 text-white" />
                            </Button>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="rounded-xl bg-white/10 backdrop-blur-md border-2 border-white/20 flex flex-col items-center justify-center text-white/70 shadow-2xl"
                    style={{
                      width: `${getPreviewDimensions().width}px`,
                      height: `${getPreviewDimensions().height}px`
                    }}
                  >
                    <div className="w-24 h-24 mb-6 bg-white/10 rounded-full flex items-center justify-center">
                      <span className="text-4xl">�</span>
                    </div>
                    <h3 className="text-xl font-semibold mb-4">Story Ready to Visualize</h3>
                    <div className="text-center max-w-sm space-y-2">
                      <p className="text-white/60 text-sm">
                        Your scenes are ready! Follow the steps below to create:
                      </p>
                      <div className="text-white/40 text-xs space-y-1">
                        <div className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">1</span>
                          <span>Generate Images (uses AI credits)</span>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">2</span>
                          <span>Add Audio narration</span>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">3</span>
                          <span>Create final video</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </main>

        {/* Right Sidebar - Controls - Restore proper width */}
        <aside className="w-80 border-l border-white/20 bg-white/90 backdrop-blur-sm shadow-lg overflow-y-auto">
          <div className="p-6 space-y-6">
            
            {/* Generation Controls Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">⚡</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Generation</h3>
              </div>
              
              <div className="space-y-3">
                {/* Images Button - restore proper size */}
                <Button
                  onClick={generateImages}
                  disabled={generatingImages}
                  className={`w-full px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    scenes.some(s => s.image_url) 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {generatingImages ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Images...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Image className="w-4 h-4" />
                      {scenes.some(s => s.image_url) ? `Regenerate Images (${scenes.filter(s => s.image_url).length})` : 'Generate Images'}
                    </div>
                  )}
                </Button>

                {/* Video Generation - restore proper size */}
                {scenes.some(s => s.image_url) && (
                  <Button 
                    onClick={() => {
                      console.log('Generate video for story:', id);
                    }}
                    className="w-full py-3 text-sm"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Generate Video
                  </Button>
                )}
              </div>
            </div>

            {/* Captions Section - restore proper spacing */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-8 h-8 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">CC</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Captions</h3>
              </div>
              
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full text-sm" 
                  disabled
                >
                  Generate Captions
                </Button>
                <p className="text-xs text-gray-500">Coming soon - Auto-generate captions</p>
              </div>
            </div>

            {/* Background Section - restore proper spacing */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-red-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">🎨</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Background</h3>
              </div>
              
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full text-sm" 
                  disabled
                >
                  Customize Background
                </Button>
                <p className="text-xs text-gray-500">Coming soon - Add custom backgrounds</p>
              </div>
            </div>

          </div>
        </aside>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background Overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setDeleteDialogOpen(false);
              setSceneToDelete(null);
            }}
          />
          
          {/* Dialog Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full mx-4 transform transition-all">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Scene</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete Scene {sceneToDelete !== null ? sceneToDelete + 1 : 1}? 
                This will permanently remove the scene and any associated images.
              </p>
              
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setSceneToDelete(null);
                  }}
                  className="px-4 py-2"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete Scene
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
