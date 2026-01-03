import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Video, Wand2, ArrowLeft, ArrowRight, Plus, Play, Download, Trash2 } from "lucide-react";

type UGCStep = 'input' | 'script' | 'customize';
type ViewMode = 'list' | 'create';

interface UGCVideo {
  id: string;
  title: string;
  status: string;
  video_url: string | null;
  duration: number | null;
  created_at: string;
  clip_count: number;
}

export default function UGCCreatorPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [ugcVideos, setUgcVideos] = useState<UGCVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Creation wizard state
  const [step, setStep] = useState<UGCStep>('input');
  const [inputText, setInputText] = useState('');
  const [ugcVideoId, setUgcVideoId] = useState<string | null>(null);
  const [scriptData, setScriptData] = useState<any>(null);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [selectingMedia, setSelectingMedia] = useState(false);

  // Authentication guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch UGC videos when in list mode
  useEffect(() => {
    if (viewMode === 'list' && user) {
      fetchUGCVideos();
    }
  }, [viewMode, user]);

  const fetchUGCVideos = async () => {
    setLoadingVideos(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/get_ugc_videos', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        setUgcVideos(data.videos || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch UGC videos:', error);
    } finally {
      setLoadingVideos(false);
    }
  };

  const startCreating = () => {
    setViewMode('create');
    setStep('input');
    setInputText('');
    setUgcVideoId(null);
    setScriptData(null);
  };

  const backToList = () => {
    setViewMode('list');
    fetchUGCVideos();
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  // Creation wizard handlers
  const handleGenerateScript = async () => {
    if (!inputText.trim()) {
      toast({ title: "Error", description: "Please enter a topic" });
      return;
    }

    setGeneratingScript(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/ugc/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ input_text: inputText })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate script');
      }

      setUgcVideoId(data.ugc_video_id);
      setScriptData(data);
      setStep('script');

      toast({
        title: "Script Generated!",
        description: `Created ${data.scenes.length} scenes. Credits: ${data.credits_remaining}`
      });

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleSelectMedia = async () => {
    if (!ugcVideoId) return;

    setSelectingMedia(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/ugc/auto-select-media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          ugc_video_id: ugcVideoId,
          media_source: 'stock_video'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to select media');
      }

      toast({
        title: "Media Selected!",
        description: `${data.clips.length} video clips selected. Moving to customization...`
      });

      setStep('customize');

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSelectingMedia(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!ugcVideoId) return;

    setGeneratingAudio(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/ugc/generate-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ ugc_video_id: ugcVideoId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate audio');
      }

      toast({
        title: "Audio Generated!",
        description: `Created audio for ${data.clips.length} clips. Ready for video!`
      });

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!ugcVideoId) return;

    setGeneratingVideo(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/ugc/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ ugc_video_id: ugcVideoId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate video');
      }

      toast({
        title: "Video Generation Started!",
        description: "Your UGC video is being created. This may take 1-2 minutes..."
      });

      // Go back to list after 3 seconds
      setTimeout(() => {
        backToList();
      }, 3000);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Video className="w-6 h-6 text-orange-600" />
            <h1 className="text-xl font-bold">
              {viewMode === 'list' ? 'UGC Videos' : 'Create UGC Video'}
            </h1>
          </div>
          <Button variant="ghost" onClick={() => router.push('/')}>
            Back to Dashboard
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {viewMode === 'list' ? (
          /* LIST VIEW */
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Your UGC Videos</h2>
                <p className="text-gray-400 text-sm mt-1">
                  {ugcVideos.length > 0 ? `${ugcVideos.length} video${ugcVideos.length === 1 ? '' : 's'} total` : 'No videos yet'}
                </p>
              </div>
              <Button
                onClick={startCreating}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New UGC Video
              </Button>
            </div>

            {loadingVideos ? (
              <div className="text-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
              </div>
            ) : ugcVideos.length === 0 ? (
              <div className="text-center py-20">
                <div className="mb-6 flex justify-center">
                  <div className="w-24 h-24 rounded-full bg-orange-900/20 flex items-center justify-center">
                    <Video className="w-12 h-12 text-orange-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-4">No UGC Videos Yet</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">
                  Create your first viral UGC-style video in minutes
                </p>
                <Button
                  onClick={startCreating}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create Your First Video
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ugcVideos.map((video) => (
                  <Card key={video.id} className="bg-gray-900/50 border-gray-800 overflow-hidden">
                    <CardContent className="p-0">
                      {video.video_url ? (
                        <div className="aspect-[9/16] bg-black relative group">
                          <video
                            src={video.video_url}
                            className="w-full h-full object-cover"
                            preload="metadata"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-white"
                              onClick={() => window.open(video.video_url!, '_blank')}
                            >
                              <Play className="w-6 h-6" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[9/16] bg-gray-800 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold text-white mb-2 truncate">{video.title}</h3>
                        <div className="flex items-center justify-between text-sm text-gray-400">
                          <span>{video.clip_count} clips</span>
                          {video.duration && <span>{video.duration.toFixed(1)}s</span>}
                        </div>
                        <div className="mt-3 flex gap-2">
                          {video.video_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => window.open(video.video_url!, '_blank')}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          /* CREATE VIEW - Existing wizard */
          <>
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
              {['Input', 'Script', 'Customize'].map((label, idx) => {
                const stepMap: UGCStep[] = ['input', 'script', 'customize'];
                const currentIdx = stepMap.indexOf(step);
                const isActive = idx === currentIdx;
                const isCompleted = idx < currentIdx;

                return (
                  <div key={label} className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 ${isActive ? 'text-orange-600' : isCompleted ? 'text-green-500' : 'text-gray-600'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${isActive ? 'border-orange-600' : isCompleted ? 'border-green-500 bg-green-500' : 'border-gray-600'}`}>
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <span className="font-medium">{label}</span>
                    </div>
                    {idx < 2 && <ArrowRight className="w-4 h-4 text-gray-600" />}
                  </div>
                );
              })}
            </div>

            <Card className="max-w-4xl mx-auto bg-gray-900/50 border-gray-800">
              <CardContent className="p-8">
                {step === 'input' && (
                  <div key="input-step" className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">What's your video about?</h2>
                      <p className="text-gray-400">Enter a topic, tweet, or pain statement. We'll create a viral UGC script.</p>
                    </div>

                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Example: Why most SaaS founders fail at marketing"
                      className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-600"
                    />

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={backToList}
                        className="flex-1"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handleGenerateScript}
                        disabled={generatingScript || !inputText.trim()}
                        className="flex-1 bg-orange-600 hover:bg-orange-700"
                      >
                        {generatingScript ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating Script...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Script (1 credit)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {step === 'script' && scriptData && (
                  <div key="script-step" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold mb-2">{scriptData.title}</h2>
                        <p className="text-gray-400">{scriptData.scenes.length} scenes • {scriptData.total_duration}s total</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setStep('input')}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                      </Button>
                    </div>

                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {scriptData.scenes.map((scene: any, idx: number) => (
                        <div key={idx} className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-400">Scene {idx + 1}</span>
                            <span className="text-sm text-orange-600">{scene.duration}s</span>
                          </div>
                          <p className="text-white">{scene.text}</p>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={handleSelectMedia}
                      disabled={selectingMedia}
                      className="w-full bg-orange-600 hover:bg-orange-700"
                    >
                      {selectingMedia ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Selecting Stock Videos...
                        </>
                      ) : (
                        <>
                          <Video className="w-4 h-4 mr-2" />
                          Auto-Select Stock Videos (1 credit)
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {step === 'customize' && (
                  <div key="customize-step" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold mb-2">Ready to Generate</h2>
                        <p className="text-gray-400">Stock videos selected. Generate audio and final video.</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setStep('script')}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <Button
                        onClick={handleGenerateAudio}
                        disabled={generatingAudio}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {generatingAudio ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating Audio...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            Generate Audio ({scriptData?.scenes.length || 0} credits)
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={handleGenerateVideo}
                        disabled={generatingVideo || generatingAudio}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {generatingVideo ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating Video...
                          </>
                        ) : (
                          <>
                            <Video className="w-4 h-4 mr-2" />
                            Generate Final Video (FREE)
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="bg-orange-900/20 border border-orange-600/50 rounded-lg p-4">
                      <p className="text-sm text-orange-200">
                        💡 <strong>Tip:</strong> Click "Generate Audio" first, then "Generate Final Video". Your UGC video will be ready in 1-2 minutes!
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
