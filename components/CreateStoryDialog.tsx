import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Smartphone, Square, Monitor } from "lucide-react";
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
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [sceneCount, setSceneCount] = useState(5);
  const [targetDuration, setTargetDuration] = useState<30 | 60 | 120 | 180>(
    creditBalance <= 15 ? 30 : 60
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("alloy");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isBlankStory, setIsBlankStory] = useState(false);

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

  // Calculate scene count based on target duration
  useEffect(() => {
    const estimatedScenes = Math.max(3, Math.round(targetDuration / 6));
    setSceneCount(estimatedScenes);
  }, [targetDuration]);

  // Load voices when dialog opens
  useEffect(() => {
    if (open && voices.length === 0) {
      fetchVoices();
    }
  }, [open]);

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

  async function createStory() {
    if (!isBlankStory && !newPrompt.trim()) return;

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
          prompt: isBlankStory ? "MyAwesomeStory" : newPrompt,
          title: isBlankStory ? "MyAwesomeStory" : null,
          sceneCount: isBlankStory ? 1 : sceneCount,
          voice_id: selectedVoiceId,
          aspect_ratio: aspectRatio,
          isBlank: isBlankStory
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const storyId = data.story_id;

        // If creating for a series, add it to the series
        if (seriesId && storyId) {
          console.log(`Adding story ${storyId} to series ${seriesId}`);
          const addToSeriesRes = await fetch("/api/series/add_story", {
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

          if (!addToSeriesRes.ok) {
            const error = await addToSeriesRes.json();
            console.error("Failed to add story to series:", error);
            alert(`Warning: Story created but failed to add to series: ${error.error || 'Unknown error'}`);
          } else {
            const result = await addToSeriesRes.json();
            console.log("Successfully added story to series:", result);
          }
        } else {
          console.log(`Not adding to series. seriesId: ${seriesId}, storyId: ${storyId}`);
        }

        // Reset form
        setNewPrompt("");
        setTargetDuration(60);
        setSelectedVoiceId("alloy");
        setAspectRatio("9:16");
        setIsBlankStory(false);

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
      <DialogContent className="sm:max-w-2xl bg-gray-900 text-white border-gray-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create a New Story</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {/* Story Input with inline Story Type toggle */}
          {!isBlankStory && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-200">
                  Add your story or an idea
                </label>

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
                    <div className={`text-sm font-medium mb-1 ${
                      selectedVoiceId === voice.id ? 'text-orange-400' : 'text-white'
                    }`}>
                      {voice.name}
                    </div>

                    {voice.labels && formatVoiceLabels(voice.labels) && (
                      <div className="text-xs text-gray-500 mb-2 line-clamp-2 min-h-[2rem]">
                        {formatVoiceLabels(voice.labels)}
                      </div>
                    )}

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
            disabled={creating || (!isBlankStory && !newPrompt.trim())}
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
      </DialogContent>
    </Dialog>
  );
}
