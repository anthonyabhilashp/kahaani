import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { X } from 'lucide-react';

interface Overlay {
  id: string;
  name: string;
  category: string;
  file_url: string;
  thumbnail_url: string | null;
}

interface OverlaySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  overlays: Overlay[];
  currentOverlayId: string | null;
  sceneImageUrl: string;
  aspectRatio: string;
  onSelectOverlay: (overlayId: string | null, overlayUrl?: string) => void;
}

export function OverlaySelectionModal({
  isOpen,
  onClose,
  overlays,
  currentOverlayId,
  sceneImageUrl,
  aspectRatio,
  onSelectOverlay,
}: OverlaySelectionModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loadedVideos, setLoadedVideos] = useState<Set<string>>(new Set());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(currentOverlayId);

  // Calculate aspect ratio padding from story data
  const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
  const aspectRatioPadding = (heightRatio / widthRatio) * 100;

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(overlays.map(o => o.category)))];

  // Filter overlays by category
  const filteredOverlays = selectedCategory === 'all'
    ? overlays
    : overlays.filter(o => o.category === selectedCategory);

  // Preload all overlay videos when modal opens
  useEffect(() => {
    if (!isOpen || overlays.length === 0) return;

    console.log('🎬 Preloading overlay videos...');

    // Only create videos that don't exist yet
    const newVideosToLoad: string[] = [];

    overlays.forEach((overlay) => {
      if (!videoRefs.current.has(overlay.id)) {
        newVideosToLoad.push(overlay.id);
        const video = document.createElement('video');
        video.src = overlay.file_url;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';

        video.addEventListener('loadeddata', () => {
          setLoadedVideos(prev => {
            const newSet = new Set(prev);
            newSet.add(overlay.id);
            return newSet;
          });
          console.log(`✅ Loaded: ${overlay.name}`);
        }, { once: true });

        videoRefs.current.set(overlay.id, video);
      }
    });

    // Only start loading new videos
    newVideosToLoad.forEach(id => {
      const video = videoRefs.current.get(id);
      if (video) {
        video.load();
      }
    });

    console.log(`Loading ${newVideosToLoad.length} new videos...`);
  }, [isOpen, overlays]);

  const loadingProgress = overlays.length > 0 ? (loadedVideos.size / overlays.length) * 100 : 0;
  const allLoaded = loadedVideos.size === overlays.length;

  // Helper function to get blend settings per category
  const getBlendSettings = (category: string) => {
    // Show overlays as-is with full opacity, only use screen blend mode
    return { blendMode: 'screen', opacity: 1.0 };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Select Overlay Effect</DialogTitle>
        </DialogHeader>

        {/* Loading Progress */}
        {!allLoaded && overlays.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Loading previews...</span>
              <span className="text-sm text-gray-400">{loadedVideos.size}/{overlays.length}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                selectedCategory === category
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Overlay Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-4 gap-4 p-1">
            {/* None Option */}
            <button
              onClick={() => {
                setSelectedOverlayId(null);
                onSelectOverlay(null, undefined);
                onClose();
              }}
              className={`relative rounded-lg border-2 transition-all overflow-hidden ${
                selectedOverlayId === null
                  ? 'border-orange-500 ring-2 ring-orange-500'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
              style={{ paddingBottom: `${aspectRatioPadding}%` }}
            >
              {/* Scene Image */}
              <img
                src={sceneImageUrl}
                alt="No overlay"
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* "None" Badge */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center">
                  <X className="w-8 h-8 mx-auto mb-2 text-white" />
                  <p className="text-sm font-medium text-white">None</p>
                </div>
              </div>
            </button>

            {/* Overlay Options */}
            {filteredOverlays.map((overlay) => {
              const blendSettings = getBlendSettings(overlay.category);

              return (
                <button
                  key={overlay.id}
                  onClick={() => {
                    setSelectedOverlayId(overlay.id);
                    onSelectOverlay(overlay.id, overlay.file_url);
                    onClose();
                  }}
                  className={`relative rounded-lg border-2 transition-all overflow-hidden group ${
                    selectedOverlayId === overlay.id
                      ? 'border-orange-500 ring-2 ring-orange-500'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  style={{ paddingBottom: `${aspectRatioPadding}%` }}
                >
                  {/* Scene Image Background */}
                  <img
                    src={sceneImageUrl}
                    alt="Scene"
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  {/* Overlay Video */}
                  {loadedVideos.has(overlay.id) ? (
                    <div
                      ref={(el) => {
                        if (el && videoRefs.current.has(overlay.id)) {
                          const video = videoRefs.current.get(overlay.id)!;
                          if (el.firstChild !== video) {
                            el.innerHTML = '';
                            video.className = 'absolute inset-0 w-full h-full object-cover';
                            video.style.mixBlendMode = blendSettings.blendMode;
                            video.style.opacity = blendSettings.opacity.toString();
                            video.play().catch(() => {});
                            el.appendChild(video);
                          }
                        }
                      }}
                      className="absolute inset-0"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-xs text-white">Loading...</p>
                      </div>
                    </div>
                  )}

                  {/* Overlay Name */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-xs font-medium text-white truncate">{overlay.name}</p>
                  </div>

                  {/* Selected Indicator */}
                  {selectedOverlayId === overlay.id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {filteredOverlays.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No overlays found in this category</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
