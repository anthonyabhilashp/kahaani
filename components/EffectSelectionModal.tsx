import React from "react";
import { X, Sparkles } from "lucide-react";
import { getAllEffects, getEffectAnimationClass, type EffectType } from "../lib/videoEffects";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface EffectSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEffect: EffectType;
  sceneImageUrl: string;
  onSelectEffect: (effectId: EffectType) => void;
}

export function EffectSelectionModal({
  isOpen,
  onClose,
  currentEffect,
  sceneImageUrl,
  onSelectEffect,
}: EffectSelectionModalProps) {
  const effects = getAllEffects();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">Select Video Effect</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Effects Grid */}
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {effects.map((effect) => (
              <Tooltip key={effect.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      onSelectEffect(effect.id);
                      onClose();
                    }}
                    className={`
                      relative group rounded-lg overflow-hidden border-2 transition-all
                      ${
                        currentEffect === effect.id
                          ? "border-blue-500 ring-2 ring-blue-500/50"
                          : "border-gray-700 hover:border-gray-500"
                      }
                    `}
                  >
              {/* Scene Preview Image with Effect Animation */}
              <div className="aspect-square bg-gray-800 overflow-hidden">
                <img
                  src={sceneImageUrl}
                  alt={effect.name}
                  className={`w-full h-full object-cover ${getEffectAnimationClass(effect.id)}`}
                  style={{
                    transformOrigin: "center center",
                    animationDuration: "5s", // Fixed duration for modal preview
                    animationIterationCount: "infinite" // Loop infinitely in modal
                  }}
                />
              </div>

              {/* Effect Label */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-2">
                <p className="text-white text-sm font-semibold text-center">
                  {effect.name}
                </p>
                {effect.isPro && (
                  <span className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">
                    PRO
                  </span>
                )}
              </div>

              {/* Selected Indicator */}
              {currentEffect === effect.id && (
                <div className="absolute top-2 left-2 bg-blue-500 text-white rounded-full p-1">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{effect.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
