import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Loader2, Plus, Smartphone, Square, Monitor, Sparkles, FileText, ArrowRight, Info } from "lucide-react";
import { useCredits } from "../hooks/useCredits";

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId?: string | null;
  onStoryCreated?: () => void;
}

export function CreateStoryDialog({ open, onOpenChange, seriesId = null, onStoryCreated }: CreateStoryDialogProps) {
  const router = useRouter();
  const { balance: creditBalance } = useCredits();

  // Step management
  const [step, setStep] = useState<'choice' | 'ai-form'>('choice');

  // Form state
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [sceneCount, setSceneCount] = useState(5);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [targetDuration, setTargetDuration] = useState<30 | 60 | 120 | 180>(
    creditBalance <= 15 ? 30 : 60
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("alloy");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Reset to step 1 when dialog closes
  useEffect(() => {
    if (!open) {
      setStep('choice');
      setNewPrompt("");
      setCreating(false);
    }
  }, [open]);

  // Fetch voices
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

  // Calculate scene count based on target duration
  useEffect(() => {
    const estimatedScenes = Math.max(3, Math.round(targetDuration / 6));
    setSceneCount(estimatedScenes);
  }, [targetDuration]);

  // Load voices when moving to AI form
  useEffect(() => {
    if (step === 'ai-form' && voices.length === 0) {
      fetchVoices();
    }
  }, [step]);

  // Play voice preview
  const playVoicePreview = (voiceId: string, previewUrl?: string) => {
    if (!previewUrl) return;

    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current = null;
    }

    if (playingPreviewId === voiceId) {
      setPlayingPreviewId(null);
      return;
    }

    const audio = new Audio(previewUrl);
    audio.play();
    audio.onended = () => setPlayingPreviewId(null);
    voicePreviewAudioRef.current = audio;
    setPlayingPreviewId(voiceId);
  };

  // Create story with AI
  async function createStoryWithAI() {
    if (!newPrompt.trim()) return;

    setCreating(true);

    try {
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
          aspect_ratio: aspectRatio,
          isBlank: false
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const storyId = data.story_id;

        // If creating for a series, add it to the series
        if (seriesId && storyId) {
          await fetch("/api/series/add_story", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              story_id: storyId,
              series_id: seriesId,
            }),
          });
        }

        // Close dialog
        onOpenChange(false);

        // Call callback if provided
        if (onStoryCreated) {
          onStoryCreated();
        }

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

  // Create blank story
  async function createBlankStory() {
    setCreating(true);

    try {
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
          prompt: "MyAwesomeStory",
          title: "MyAwesomeStory",
          sceneCount: 1,
          voice_id: "alloy",
          aspect_ratio: "9:16",
          isBlank: true
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const storyId = data.story_id;

        // If creating for a series, add it to the series
        if (seriesId && storyId) {
          await fetch("/api/series/add_story", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              story_id: storyId,
              series_id: seriesId,
            }),
          });
        }

        // Close dialog
        onOpenChange(false);

        // Call callback if provided
        if (onStoryCreated) {
          onStoryCreated();
        }

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

  function formatTargetDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    return `${seconds / 60}m`;
  }

  function formatVoiceLabels(labels?: Record<string, any>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .filter(([_, value]) => value && typeof value === 'string')
      .slice(0, 3)
      .map(([_, value]) => {
        return value.split('_').map((word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      })
      .join(' • ');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl bg-gray-900 text-white border-gray-800 max-h-[90vh] overflow-y-auto">
        {step === 'choice' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center">Create New Video</DialogTitle>
            </DialogHeader>

            <div className="grid md:grid-cols-2 gap-6 mt-6">
              {/* AI Generated Option */}
              <div className="flex flex-col bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-orange-500/50 transition-all group focus:outline-none focus-visible:outline-none">
                {/* Icon */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Generate with AI</h3>
                    <p className="text-sm text-gray-400">Let AI generate everything for you</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-400 mb-6">
                  Generate a script with AI or use your own, then generate a video in seconds.
                </p>

                {/* Button */}
                <Button
                  onClick={() => setStep('ai-form')}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold focus:outline-none focus-visible:ring-0"
                  size="lg"
                >
                  Create with AI <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              {/* Blank Story Option */}
              <div className="flex flex-col bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-orange-500/50 transition-all group focus:outline-none focus-visible:outline-none">
                {/* Icon */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-gray-300" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Create Blank Video</h3>
                    <p className="text-sm text-gray-400">Alternatively start from scratch</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-400 mb-6">
                  Create a blank video and create scenes one by one.
                </p>

                {/* Button */}
                <Button
                  onClick={createBlankStory}
                  disabled={creating}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold focus:outline-none focus-visible:ring-0"
                  size="lg"
                >
                  {creating ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" /> Creating...
                    </>
                  ) : (
                    <>
                      Create Blank Video <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-2xl font-bold">Generate with AI</DialogTitle>
                <button
                  onClick={() => setStep('choice')}
                  className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                >
                  ← Back
                </button>
              </div>
            </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Story Input */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Add your story or an idea
              </label>
              <textarea
                placeholder="A young blacksmith forges a sword from fallen stars, awakening an ancient power that will either save the kingdom or doom it forever."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                rows={4}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder:text-gray-500 text-sm"
              />
            </div>

            {/* Number of Scenes */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium text-gray-200">
                  Number of scenes for your story
                  {creditBalance <= 10 && (
                    <span className="text-xs text-yellow-400 font-normal ml-2">(Max 5 scenes with low credits)</span>
                  )}
                </label>
              </div>

              {/* Slider with progress bar and milestones */}
              <div className="relative" style={{ paddingTop: '4px', paddingBottom: '8px' }}>
                {/* Progress line */}
                <div className="absolute left-0 right-0 h-2 bg-gray-700 rounded-full" style={{ top: '24px' }}>
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full transition-all duration-200"
                    style={{ width: `${((sceneCount - 1) / 29) * 100}%` }}
                  />
                </div>

                {/* Milestone markers */}
                <div className="absolute left-0 right-0 flex justify-between pointer-events-none" style={{ top: '24px' }}>
                  {[1, 5, 10, 15, 20, 25, 30].map((milestone) => {
                    const isActive = sceneCount >= milestone;
                    const position = ((milestone - 1) / 29) * 100;
                    return (
                      <div
                        key={milestone}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${position}%`, transform: 'translateX(-50%)', top: '-2px' }}
                      >
                        {/* Milestone dot */}
                        <div className={`w-2 h-2 rounded-full transition-all ${
                          isActive
                            ? 'bg-orange-500'
                            : 'bg-gray-600'
                        }`} />
                        {/* Milestone label below */}
                        <span className="text-[10px] text-gray-500 mt-1">{milestone}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Slider with value bubble */}
                <div className="relative">
                  <Slider
                    value={[sceneCount]}
                    onValueChange={(value) => {
                      const newValue = value[0];
                      if (creditBalance <= 10 && newValue > 5) {
                        setSceneCount(5);
                        setShowCreditWarning(true);
                      } else {
                        setSceneCount(newValue);
                        setShowCreditWarning(false);
                      }
                    }}
                    min={1}
                    max={30}
                    step={1}
                    showValue={true}
                    className="w-full"
                  />
                </div>

                {/* Floating duration and credits below handler */}
                <div
                  className="absolute transition-all duration-200"
                  style={{
                    left: `${((sceneCount - 1) / 29) * 100}%`,
                    transform: 'translateX(-50%)',
                    top: '46px'
                  }}
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap px-2 py-1">
                    <span className="text-[10px] text-gray-400">~{Math.round(sceneCount * 12 / 60)}min</span>
                    <span className="text-[10px] text-gray-600">•</span>
                    <span className="text-[10px] text-orange-400">~{sceneCount * 2} credits</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Create Button */}
            <Button
              disabled={creating || !newPrompt.trim()}
              onClick={createStoryWithAI}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
