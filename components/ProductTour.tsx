import React, { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';

interface ProductTourProps {
  run: boolean;
  onFinish: () => void;
  onStepChange?: (stepIndex: number) => void;
  initialStepIndex?: number;
  mode?: 'dashboard' | 'editor'; // Which tour to show
}

export function ProductTour({ run, onFinish, onStepChange, initialStepIndex = 0, mode = 'dashboard' }: ProductTourProps) {
  const [stepIndex, setStepIndex] = useState(initialStepIndex);

  // Update step index when initialStepIndex changes
  useEffect(() => {
    setStepIndex(initialStepIndex);
  }, [initialStepIndex]);

  // Build steps array - include video editor steps only if user has stories
  const dashboardSteps: Step[] = [
    {
      target: 'body',
      content: (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to Kahaani! 🎬</h2>
          <p className="text-gray-600 text-sm">Let's create your first AI-powered story in 60 seconds</p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour="create-story-button"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Click here to start</p>
          <p className="text-gray-600 text-sm">Let's create your first story</p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="story-prompt-input"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Describe your story</p>
          <p className="text-gray-600 text-sm">Be specific about characters, setting, and plot</p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="scene-count-selector"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Choose number of scenes</p>
          <p className="text-gray-600 text-sm">More scenes = longer video (5-15 recommended)</p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="format-selector"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Pick your video format</p>
          <p className="text-gray-600 text-sm">9:16 for TikTok/Reels, 16:9 for YouTube, 1:1 for Instagram</p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="voice-selector"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Select narration voice</p>
          <p className="text-gray-600 text-sm">Click preview to hear each voice</p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="create-button"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Ready to create!</p>
          <p className="text-gray-600 text-sm">
            Click Create to generate your story scenes! You'll then access the video editor to add images, audio, and generate your video.
          </p>
        </div>
      ),
      placement: 'top',
    },
  ];

  const videoEditorSteps: Step[] = [
    {
      target: 'body',
      content: (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to the Video Editor! 🎬</h2>
          <p className="text-gray-600 text-sm">Let's explore how to bring your story to life with images, audio, captions, and video.</p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour="scenes-tab"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Scenes Tab</p>
          <p className="text-gray-600 text-sm">View and manage all your story scenes from this tab</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="scene-tile"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Scene Tiles</p>
          <p className="text-gray-600 text-sm">Each scene shows its thumbnail, text, and status. Click to edit text, regenerate images, or adjust settings.</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="generate-images-button"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Generate Images</p>
          <p className="text-gray-600 text-sm">Create visuals for all scenes at once • Costs 1 credit per scene</p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="generate-audio-button"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Generate Audio</p>
          <p className="text-gray-600 text-sm">Add narration to all scenes • Also 1 credit per scene</p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="captions-tab"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Captions Tab</p>
          <p className="text-gray-600 text-sm">Customize caption style, font, colors, position, and animation for your video</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="music-tab"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-1">Background Music</p>
          <p className="text-gray-600 text-sm">Add background music from our library, upload your own, or import from YouTube</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="video-preview"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-2">Video Preview</p>
          <p className="text-gray-600 text-sm">
            The right panel shows your video preview. Play it to see your story come to life with all effects applied!
          </p>
        </div>
      ),
      placement: 'left',
    },
    {
      target: '[data-tour="export-button"]',
      content: (
        <div>
          <p className="text-gray-900 font-semibold mb-2">Export Video</p>
          <p className="text-gray-600 text-sm mb-3">
            Once images and audio are ready, click here to generate your final video - completely FREE!
          </p>
          <p className="text-gray-600 text-sm">
            🎉 You're all set! Start creating amazing AI-powered stories.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
  ];

  // Select steps based on mode
  const steps: Step[] = mode === 'editor' ? videoEditorSteps : dashboardSteps;

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, index, action, type } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      // Tour completed or skipped
      setStepIndex(0);
      onFinish();
    } else if (type === 'step:after') {
      // Step transition
      const newIndex = action === 'next' ? index + 1 : action === 'prev' ? index - 1 : index;
      setStepIndex(newIndex);
      onStepChange?.(newIndex);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      stepIndex={stepIndex}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#ea580c', // Orange-600
          textColor: '#1f2937', // Gray-800
          backgroundColor: '#ffffff',
          arrowColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 12,
          fontSize: 14,
          padding: 20,
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#ea580c',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          padding: '10px 20px',
        },
        buttonBack: {
          color: '#6b7280',
          marginRight: 10,
        },
        buttonSkip: {
          color: '#9ca3af',
          fontSize: 14,
        },
        spotlight: {
          borderRadius: 8,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        open: 'Open',
        skip: 'Skip tour',
      }}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}
