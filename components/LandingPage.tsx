import { Button } from "@/components/ui/button";
import { Sparkles, Video, Image, Music, Wand2, Clock, Zap, ArrowRight, Play, Volume2, VolumeX, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";

type ShowcaseVideo = {
  id: string;
  title: string;
  videoUrl: string;
  duration: string;
  category: string;
};

export function LandingPage() {
  const router = useRouter();
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  // Handle playing a video - pause all others
  const handlePlayVideo = (videoId: string) => {
    // Pause all other videos
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach(video => {
      if (!video.src.includes(showcaseVideos.find(v => v.id === videoId)?.videoUrl || '')) {
        video.pause();
      }
    });
    setPlayingVideoId(videoId);
  };

  const handleVolumeChange = (videoId: string, volume: number) => {
    setVolumes(prev => ({ ...prev, [videoId]: volume }));
  };

  const getVolume = (videoId: string) => volumes[videoId] ?? 0; // Default muted
  const getDefaultVolume = () => 0.5; // Default unmute volume level

  // 🎬 Showcase videos - using first frame as thumbnail
  const showcaseVideos: ShowcaseVideo[] = [
    {
      id: "1",
      title: "Cleopatra: Queen of the Nile",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/cleopatra_queen_of_nile.mp4",
      duration: "1:30",
      category: "History"
    },
    {
      id: "2",
      title: "Motivational Wisdom",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/motivation.mp4",
      duration: "1:45",
      category: "Inspiration"
    },
    {
      id: "3",
      title: "The Magical Paint Brush",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/magical_paint_brush.mp4",
      duration: "2:00",
      category: "Fantasy"
    },
    {
      id: "4",
      title: "Kids Moral Story",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/kids_moral_story.mp4",
      duration: "1:50",
      category: "Education"
    },
    {
      id: "5",
      title: "Stoic Wisdom",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/stoic_wisdom.mp4",
      duration: "1:35",
      category: "Philosophy"
    },
    {
      id: "6",
      title: "Interesting Facts",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/interesting_facts.mp4",
      duration: "1:55",
      category: "Knowledge"
    },
    {
      id: "7",
      title: "Life of a Honeybee",
      videoUrl: "https://lumyilzpjiwxuwkbgsia.supabase.co/storage/v1/object/public/showcase/life_of_honeybee.mp4",
      duration: "1:40",
      category: "Nature"
    }
  ];

  const pricingPackages = [
    {
      id: "starter",
      credits: 250,
      price: 20,
      pricePerCredit: 0.08,
      savings: "~25 stories"
    },
    {
      id: "popular",
      credits: 1000,
      price: 70,
      pricePerCredit: 0.07,
      popular: true,
      savings: "~100 stories"
    },
    {
      id: "pro",
      credits: 3000,
      price: 180,
      pricePerCredit: 0.06,
      bestValue: true,
      savings: "~300 stories"
    }
  ];

  const features = [
    {
      icon: Wand2,
      title: "AI Story Generation",
      description: "Transform any text prompt into a complete visual story with multiple scenes"
    },
    {
      icon: Image,
      title: "Consistent Imagery",
      description: "Advanced character reference system ensures consistent visuals across all scenes"
    },
    {
      icon: Music,
      title: "Professional Narration",
      description: "Choose from multiple AI voices with natural-sounding audio for each scene"
    },
    {
      icon: Video,
      title: "Automated Video Creation",
      description: "Combines images, audio, captions, and effects into polished video content"
    },
    {
      icon: Clock,
      title: "Multiple Formats",
      description: "Create 30s, 1min, 2min, or 3min videos in portrait, landscape, or square"
    },
    {
      icon: Zap,
      title: "Fast Generation",
      description: "From idea to finished video in minutes, not hours or days"
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-md fixed w-full top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Kahaani</h1>
            </button>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => {
                  const pricingSection = document.getElementById('pricing');
                  if (pricingSection) {
                    pricingSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="text-gray-300 hover:text-white hover:bg-gray-800 hidden sm:flex"
              >
                Pricing
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/login')}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                Sign In
              </Button>
              <Button
                onClick={() => router.push('/login')}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-orange-900/20 border border-orange-700/30 rounded-full px-4 py-2 mb-6">
                <Sparkles className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-orange-300">AI-Powered Story Video Creation</span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                Turn Your Stories Into
                <br />
                <span className="bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent">
                  Stunning Videos
                </span>
              </h1>

              <p className="text-xl text-gray-400 mb-8 leading-relaxed">
                Create professional story videos in minutes. Transform any text into engaging visual narratives with AI-powered scene generation, consistent imagery, and professional narration.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4">
                <Button
                  size="lg"
                  onClick={() => router.push('/login')}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-lg px-8 py-6 shadow-lg shadow-orange-600/30"
                >
                  Start Creating Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-gray-800">
                <div>
                  <div className="text-3xl font-bold text-orange-400 mb-1">5 minutes</div>
                  <div className="text-sm text-gray-500">Average Creation Time</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-orange-400 mb-1">3</div>
                  <div className="text-sm text-gray-500">Video Formats</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-orange-400 mb-1">100%</div>
                  <div className="text-sm text-gray-500">AI-Powered</div>
                </div>
              </div>
            </div>

            {/* Right: Video Tiles - Mobile: Simple Grid, Desktop: 3D Stacked */}
            {/* Mobile Grid */}
            <div className="grid grid-cols-2 gap-3 lg:hidden">
              {showcaseVideos.slice(0, 4).map((video) => {
                const isPlaying = playingVideoId === video.id;
                const volume = getVolume(video.id);

                return (
                  <div key={video.id} className="group relative">
                    <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-900 border border-gray-800 hover:border-orange-500">
                      <video
                        src={video.videoUrl}
                        preload="auto"
                        loop
                        playsInline
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={(e) => {
                          const videoEl = e.currentTarget as HTMLVideoElement;
                          if (isPlaying && !videoEl.paused) {
                            videoEl.pause();
                            setPlayingVideoId(null);
                          } else {
                            handlePlayVideo(video.id);
                            videoEl.volume = volume;
                            videoEl.play();
                          }
                        }}
                        onEnded={() => setPlayingVideoId(null)}
                      />
                      {!isPlaying && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none">
                            <div className="absolute bottom-0 left-0 right-0 p-2">
                              <h3 className="text-[10px] font-semibold text-white line-clamp-2">{video.title}</h3>
                            </div>
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <div className="bg-orange-600 p-2 rounded-full">
                              <Play className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </>
                      )}
                      {isPlaying && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (volume === 0) {
                              const newVol = getDefaultVolume();
                              handleVolumeChange(video.id, newVol);
                              const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                              if (videoEl) videoEl.volume = newVol;
                            } else {
                              handleVolumeChange(video.id, 0);
                              const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                              if (videoEl) videoEl.volume = 0;
                            }
                          }}
                          className="absolute bottom-2 left-2 flex items-center justify-center bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full p-1.5 transition-colors"
                        >
                          {volume === 0 ? (
                            <VolumeX className="w-3 h-3" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop 3D Stacked */}
            <div className="relative hidden lg:flex justify-end items-center h-[500px]">
              {showcaseVideos.slice(0, 3).map((video, index) => {
                const isPlaying = playingVideoId === video.id;
                const rotations = ['rotate-[-8deg]', 'rotate-[4deg]', 'rotate-[-6deg]'];
                const positions = ['z-30 translate-x-0', 'z-20 translate-x-[-40px]', 'z-10 translate-x-[-80px]'];
                const volume = getVolume(video.id);

                return (
                  <div
                    key={video.id}
                    className={`group absolute w-[240px] ${positions[index]} ${isPlaying ? '' : rotations[index]} transition-all duration-300 hover:scale-105 hover:z-40 hover:rotate-0`}
                    style={{ right: `${index * 140}px` }}
                  >
                    <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 border-2 border-gray-800 hover:border-orange-500 shadow-2xl">
                      <video
                        src={video.videoUrl}
                        preload="auto"
                        loop
                        playsInline
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={(e) => {
                          const videoEl = e.currentTarget as HTMLVideoElement;
                          if (isPlaying && !videoEl.paused) {
                            videoEl.pause();
                            setPlayingVideoId(null);
                          } else {
                            handlePlayVideo(video.id);
                            videoEl.volume = volume;
                            videoEl.play();
                          }
                        }}
                        onEnded={() => setPlayingVideoId(null)}
                      />
                      {!isPlaying && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none">
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                              <h3 className="text-sm font-bold text-white">{video.title}</h3>
                            </div>
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
                            <div className="bg-orange-600 p-3 rounded-full shadow-lg">
                              <Play className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        </>
                      )}
                      {isPlaying && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (volume === 0) {
                              const newVol = getDefaultVolume();
                              handleVolumeChange(video.id, newVol);
                              const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                              if (videoEl) videoEl.volume = newVol;
                            } else {
                              handleVolumeChange(video.id, 0);
                              const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                              if (videoEl) videoEl.volume = 0;
                            }
                          }}
                          className="absolute bottom-3 left-3 flex items-center justify-center bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full p-2.5 transition-colors"
                        >
                          {volume === 0 ? (
                            <VolumeX className="w-5 h-5" />
                          ) : (
                            <Volume2 className="w-5 h-5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile: Simple row */}
            <div className="flex lg:hidden gap-2 justify-center px-4">
              {showcaseVideos.slice(0, 3).map((video) => {
                const isPlaying = playingVideoId === video.id;
                const volume = getVolume(video.id);
                return (
                  <div key={video.id} className="group relative flex-1 max-w-[120px]">
                    <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-900 border border-gray-800 shadow-lg">
                      <video
                        src={video.videoUrl}
                        preload="auto"
                        loop
                        playsInline
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={(e) => {
                          const videoEl = e.currentTarget as HTMLVideoElement;
                          if (isPlaying && !videoEl.paused) {
                            videoEl.pause();
                            setPlayingVideoId(null);
                          } else {
                            handlePlayVideo(video.id);
                            videoEl.volume = volume;
                            videoEl.play();
                          }
                        }}
                        onEnded={() => setPlayingVideoId(null)}
                      />
                      {!isPlaying && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none">
                          <div className="absolute bottom-0 left-0 right-0 p-2">
                            <h3 className="text-[10px] font-semibold text-white line-clamp-2">{video.title}</h3>
                          </div>
                        </div>
                      )}
                      {isPlaying && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (volume === 0) {
                              const newVol = getDefaultVolume();
                              handleVolumeChange(video.id, newVol);
                              const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                              if (videoEl) videoEl.volume = newVol;
                            } else {
                              handleVolumeChange(video.id, 0);
                              const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                              if (videoEl) videoEl.volume = 0;
                            }
                          }}
                          className="absolute bottom-2 left-2 flex items-center justify-center bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full p-2 transition-colors"
                        >
                          {volume === 0 ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Full Showcase Gallery */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">More Examples</h2>
            <p className="text-lg text-gray-400">
              Real videos created with Kahaani
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 max-w-[1800px] mx-auto">
            {showcaseVideos.slice(3).map((video) => {
              const isPlaying = playingVideoId === video.id;
              const volume = getVolume(video.id);

              return (
                <div
                  key={video.id}
                  className="group relative w-[240px]"
                >
                  <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 border-2 border-gray-800 hover:border-orange-500 transition-all shadow-xl hover:shadow-orange-500/40 hover:scale-105">
                    <video
                      src={video.videoUrl}
                      preload="auto"
                      loop
                      playsInline
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={(e) => {
                        const videoEl = e.currentTarget as HTMLVideoElement;
                        if (isPlaying && !videoEl.paused) {
                          videoEl.pause();
                          setPlayingVideoId(null);
                        } else {
                          handlePlayVideo(video.id);
                          videoEl.volume = volume;
                          videoEl.play();
                        }
                      }}
                      onEnded={() => setPlayingVideoId(null)}
                    />

                    {!isPlaying && (
                      <>
                        {/* Info Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none">
                          <div className="absolute bottom-0 left-0 right-0 p-3.5">
                            <div className="text-xs text-orange-400 font-medium mb-1">{video.category}</div>
                            <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug mb-1.5">
                              {video.title}
                            </h3>
                            <div className="flex items-center text-xs text-gray-300">
                              <Clock className="w-3 h-3 mr-1" />
                              <span>{video.duration}</span>
                            </div>
                          </div>
                        </div>

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
                          <div className="bg-orange-600 p-4 rounded-full shadow-lg">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                        </div>
                      </>
                    )}

                    {isPlaying && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (volume === 0) {
                            const newVol = getDefaultVolume();
                            handleVolumeChange(video.id, newVol);
                            const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                            if (videoEl) videoEl.volume = newVol;
                          } else {
                            handleVolumeChange(video.id, 0);
                            const videoEl = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                            if (videoEl) videoEl.volume = 0;
                          }
                        }}
                        className="absolute bottom-3 left-3 flex items-center justify-center bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full p-2.5 transition-colors"
                      >
                        {volume === 0 ? (
                          <VolumeX className="w-5 h-5" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-10">
            <Button
              onClick={() => router.push('/login')}
              size="lg"
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Create Your Own Story
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-xl text-gray-400">
              A complete AI-powered story video creation platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-orange-600/50 transition-all duration-300 group"
              >
                <div className="w-12 h-12 bg-orange-900/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-orange-600 transition-colors">
                  <feature.icon className="w-6 h-6 text-orange-400 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-gray-400">
              Four simple steps from idea to finished video
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Enter Your Story",
                description: "Type your story idea or paste existing text. Choose duration and format."
              },
              {
                step: "02",
                title: "Generate Scenes",
                description: "AI breaks your story into visual scenes with consistent characters."
              },
              {
                step: "03",
                title: "Add Media",
                description: "Generate images, add narration, choose voices, and customize captions."
              },
              {
                step: "04",
                title: "Export Video",
                description: "Download your polished video ready for YouTube, TikTok, or Instagram."
              }
            ].map((step, index) => (
              <div key={index} className="relative">
                <div className="text-6xl font-bold text-orange-900/30 mb-4">{step.step}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
                {index < 3 && (
                  <div className="hidden md:block absolute top-12 -right-4 w-8 h-0.5 bg-gradient-to-r from-orange-600 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Perfect For</h2>
            <p className="text-xl text-gray-400">
              Create engaging content for any niche
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Educational Content",
                description: "Make learning engaging with visual storytelling for any subject or topic",
                emoji: "🎓"
              },
              {
                title: "YouTube Channels",
                description: "Consistently create content for story-based YouTube channels",
                emoji: "🎬"
              },
              {
                title: "Social Media",
                description: "Generate viral-ready short-form content for TikTok, Reels, and Shorts",
                emoji: "📱"
              },
              {
                title: "Content Creators",
                description: "Scale your content production with AI-powered story generation",
                emoji: "✨"
              },
              {
                title: "Marketing & Brands",
                description: "Create compelling brand stories and marketing narratives",
                emoji: "🎯"
              },
              {
                title: "Entertainment",
                description: "Craft engaging visual stories that captivate your audience",
                emoji: "🎭"
              }
            ].map((useCase, index) => (
              <div
                key={index}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-orange-600/50 transition-all"
              >
                <div className="text-4xl mb-4">{useCase.emoji}</div>
                <h3 className="text-xl font-semibold mb-2">{useCase.title}</h3>
                <p className="text-gray-400">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-400">
              Pay once, use forever. No subscriptions, no hidden fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 max-w-5xl mx-auto">
            {pricingPackages.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative rounded-xl border transition-all duration-200 hover:-translate-y-1 ${
                  pkg.popular
                    ? "bg-gradient-to-b from-orange-500/5 to-transparent border-orange-500/30 shadow-lg shadow-orange-500/5"
                    : pkg.bestValue
                    ? "bg-gradient-to-b from-green-500/5 to-transparent border-green-500/30 shadow-lg shadow-green-500/5"
                    : "bg-gray-900/40 border-gray-800/60 hover:border-gray-700"
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-gradient-to-r from-orange-500 to-orange-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
                      Popular
                    </span>
                  </div>
                )}
                {pkg.bestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-gradient-to-r from-green-500 to-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Best Value
                    </span>
                  </div>
                )}

                <div className="p-6">
                  {/* Credits */}
                  <div className="mb-4">
                    <div className="flex items-baseline justify-center gap-1.5 mb-1">
                      <h3 className="text-3xl font-bold text-white">{pkg.credits}</h3>
                      <span className="text-sm text-gray-500 font-medium">credits</span>
                    </div>
                    <p className="text-center text-xs text-gray-500">{pkg.savings}</p>
                  </div>

                  {/* Price */}
                  <div className="text-center mb-5">
                    <div className="flex items-baseline justify-center gap-0.5 mb-1">
                      <span className="text-4xl font-bold text-white">${pkg.price}</span>
                    </div>
                    <p className="text-xs text-gray-500">${pkg.pricePerCredit.toFixed(2)} per credit</p>
                  </div>

                  {/* Button */}
                  <Button
                    onClick={() => router.push('/login')}
                    className={`w-full font-semibold text-sm h-10 rounded-lg transition-all ${
                      pkg.popular
                        ? "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25"
                        : pkg.bestValue
                        ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/25"
                        : "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                    }`}
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* What's Included */}
          <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-5 text-center">What's Included</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="text-xs font-semibold mb-3 text-gray-400 uppercase tracking-wider">Credit Usage</h4>
                <ul className="space-y-2.5 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">1 credit</span> per image</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">1 credit</span> per audio</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">Free</span> video generation</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-3 text-gray-400 uppercase tracking-wider">Features</h4>
                <ul className="space-y-2.5 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>AI-powered scene generation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Professional AI narration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>3 video formats (9:16, 16:9, 1:1)</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-3 text-gray-400 uppercase tracking-wider">Benefits</h4>
                <ul className="space-y-2.5 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">Credits never expire</span></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>15 free credits on signup</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>No subscription required</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-orange-900/20 to-pink-900/20 border-t border-b border-orange-700/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            Ready to Create Your First Story?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join creators who are transforming stories into stunning videos with AI
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push('/login')}
              className="bg-orange-600 hover:bg-orange-700 text-white text-lg px-8 py-6"
            >
              Start Creating Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <p className="text-sm text-gray-400">No credit card required</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Kahaani</span>
            </div>
            <div className="text-gray-500 text-sm">
              © 2025 Kahaani. AI-powered story video creation.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
