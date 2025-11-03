import { Button } from "@/components/ui/button";
import { Sparkles, Video, Image, Music, Wand2, Clock, Zap, ArrowRight, Play } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";

export function LandingPage() {
  const router = useRouter();
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  // Sample showcase videos (placeholders for now)
  const showcaseVideos = [
    {
      id: 1,
      title: "The Brave Explorer",
      thumbnail: null,
      videoUrl: null, // Will be replaced with real videos
      duration: "1:30",
      category: "Adventure"
    },
    {
      id: 2,
      title: "Journey to Discovery",
      thumbnail: null,
      videoUrl: null,
      duration: "2:00",
      category: "Educational"
    },
    {
      id: 3,
      title: "The Lost Kingdom",
      thumbnail: null,
      videoUrl: null,
      duration: "1:45",
      category: "Fantasy"
    },
    {
      id: 4,
      title: "Lessons from History",
      thumbnail: null,
      videoUrl: null,
      duration: "2:15",
      category: "Educational"
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Kahaani</h1>
            </div>
            <div className="flex items-center gap-4">
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
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-900/20 border border-orange-700/30 rounded-full px-4 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300">AI-Powered Story Video Creation</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Turn Your Stories Into
            <br />
            <span className="bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent">
              Stunning Videos
            </span>
          </h1>

          <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto">
            Create professional story videos in minutes. Transform any text into engaging visual narratives with AI-powered scene generation, consistent imagery, and professional narration.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push('/login')}
              className="bg-orange-600 hover:bg-orange-700 text-white text-lg px-8 py-6"
            >
              Start Creating Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-gray-700 text-white hover:bg-gray-800 text-lg px-8 py-6"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch Demo
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div>
              <div className="text-3xl font-bold text-orange-400">3 min</div>
              <div className="text-sm text-gray-500 mt-1">Avg. Creation Time</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-400">9:16</div>
              <div className="text-sm text-gray-500 mt-1">Mobile-First Format</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-400">100%</div>
              <div className="text-sm text-gray-500 mt-1">AI-Powered</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-950">
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
      <section className="py-20 px-4 sm:px-6 lg:px-8">
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

      {/* Showcase Gallery */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Showcase Gallery</h2>
            <p className="text-xl text-gray-400">
              See what's possible with Kahaani
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {showcaseVideos.map((video) => (
              <div
                key={video.id}
                className="group relative cursor-pointer"
                onClick={() => video.videoUrl && setPlayingVideo(video.id.toString())}
              >
                <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-900 border border-gray-800 hover:border-orange-600/50 transition-all">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <Video className="w-16 h-16 text-gray-600" />
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent">
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="text-xs text-orange-400 mb-1">{video.category}</div>
                      <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                        {video.title}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{video.duration}</span>
                      </div>
                    </div>
                  </div>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="bg-orange-600 p-3 rounded-full">
                      <Play className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  {/* Placeholder badge */}
                  <div className="absolute top-2 right-2 bg-orange-900/80 backdrop-blur-sm text-orange-300 text-xs px-2 py-1 rounded">
                    Coming Soon
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-500 text-sm">
              * Video showcase coming soon. Start creating your own stories today!
            </p>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
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
