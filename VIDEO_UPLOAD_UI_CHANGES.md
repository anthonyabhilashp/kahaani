# UI Changes for Scene Video Upload Feature

## Files Modified:
- `pages/story/[id].tsx` - Add dropdown menu and video upload handler

## Changes Needed:

### 1. Add State Variables (around line 119)

```typescript
// Add after existing state variables
const [uploadingSceneVideo, setUploadingSceneVideo] = useState<Set<number>>(new Set());
const [videoUploadProgress, setVideoUploadProgress] = useState<{ [key: number]: number }>({});
const videoFileInputRef = useRef<HTMLInputElement | null>(null);
const [selectedVideoSceneIndex, setSelectedVideoSceneIndex] = useState<number | null>(null);
```

### 2. Add Video Upload Handler Function (after other handler functions)

```typescript
// Handle video file selection for scene
const handleSceneVideoUpload = async (sceneIndex: number, file: File) => {
  const scene = scenes[sceneIndex];
  if (!scene) return;

  try {
    setUploadingSceneVideo(prev => new Set(prev).add(sceneIndex));
    setVideoUploadProgress(prev => ({ ...prev, [sceneIndex]: 0 }));

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("Please log in to upload videos");
    }

    // Create form data
    const formData = new FormData();
    formData.append('scene_id', scene.id);
    formData.append('video', file);

    // Upload with progress tracking
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        setVideoUploadProgress(prev => ({ ...prev, [sceneIndex]: progress }));
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);

        toast({
          title: "✅ Video Uploaded Successfully",
          description: `Scene ${sceneIndex + 1} video uploaded and transcribed`,
        });

        // Update scene in state
        setScenes(prevScenes => {
          const newScenes = [...prevScenes];
          newScenes[sceneIndex] = {
            ...newScenes[sceneIndex],
            video_url: result.video_url,
            audio_url: result.audio_url,
            text: result.text,
            duration: result.duration,
            word_timestamps: result.word_timestamps,
          };
          return newScenes;
        });

        // Refresh story data
        fetchStoryWithScenes(id as string, true);
      } else {
        const error = JSON.parse(xhr.responseText);
        throw new Error(error.error || 'Upload failed');
      }
    });

    xhr.addEventListener('error', () => {
      throw new Error('Network error during upload');
    });

    xhr.open('POST', '/api/upload-scene-video');
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.send(formData);

  } catch (err: any) {
    console.error('Error uploading video:', err);
    toast({
      title: "❌ Upload Failed",
      description: err.message || "Failed to upload video",
      variant: "destructive",
    });
  } finally {
    setUploadingSceneVideo(prev => {
      const newSet = new Set(prev);
      newSet.delete(sceneIndex);
      return newSet;
    });
    setVideoUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[sceneIndex];
      return newProgress;
    });
  }
};

// Trigger file input for video upload
const openVideoUpload = (sceneIndex: number) => {
  setSelectedVideoSceneIndex(sceneIndex);
  videoFileInputRef.current?.click();
};

// Handle file input change
const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file && selectedVideoSceneIndex !== null) {
    // Validate file
    if (!file.type.startsWith('video/')) {
      toast({
        title: "❌ Invalid File",
        description: "Please select a video file",
        variant: "destructive",
      });
      return;
    }

    // Check file size (200MB max)
    const maxSize = 200 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "❌ File Too Large",
        description: "Maximum file size is 200MB",
        variant: "destructive",
      });
      return;
    }

    handleSceneVideoUpload(selectedVideoSceneIndex, file);
  }

  // Reset file input
  if (e.target) {
    e.target.value = '';
  }
};
```

### 3. Replace Image Button with Dropdown (lines 3553-3605)

**Replace this:**
```tsx
{/* Image Button or Status */}
<Tooltip>
  <TooltipTrigger asChild>
    {scene.image_url ? (
      <button onClick={(e) => { ... }}>
        Image Status
      </button>
    ) : (
      <button onClick={(e) => { ... }}>
        Generate Image
      </button>
    )}
  </TooltipTrigger>
</Tooltip>
```

**With this:**
```tsx
{/* Image/Video Button with Dropdown */}
<Tooltip>
  <TooltipTrigger asChild>
    {scene.image_url || scene.video_url ? (
      // Already has media - show status button
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (scene.video_url) {
            // For videos, could open video settings or show info
            toast({
              title: "Video Uploaded",
              description: "Video is ready for final generation",
            });
          } else {
            openImageDrawer(index);
          }
        }}
        disabled={generatingSceneImage.has(index) || uploadingSceneVideo.has(index)}
        className={`px-2 lg:px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50 ${
          isImageOutdated(scene) || (scene.video_url && !scene.audio_url)
            ? 'bg-yellow-900/50 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-400'
            : 'bg-green-800 hover:bg-green-700 text-white'
        }`}
      >
        {uploadingSceneVideo.has(index) ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px] lg:text-xs">{videoUploadProgress[index] || 0}%</span>
          </>
        ) : generatingSceneImage.has(index) ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px] lg:text-xs">Gen...</span>
          </>
        ) : (
          <>
            <Check className="w-3 h-3" />
            <span className="text-[10px] lg:text-xs">{scene.video_url ? 'Video' : 'Image'}</span>
          </>
        )}
      </button>
    ) : (
      // No media yet - show dropdown with options
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            disabled={generatingSceneImage.has(index) || uploadingSceneVideo.has(index)}
            className="px-2 lg:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded transition-colors flex items-center gap-1 lg:gap-1.5 disabled:opacity-50"
          >
            {uploadingSceneVideo.has(index) ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] lg:text-xs">{videoUploadProgress[index] || 0}%</span>
              </>
            ) : generatingSceneImage.has(index) ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] lg:text-xs">Gen...</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span className="text-[10px] lg:text-xs">Add Media</span>
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-gray-900 border-gray-700">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              openImageDrawer(index);
            }}
            className="text-gray-300 hover:bg-gray-800 focus:bg-gray-800 cursor-pointer"
          >
            <Image className="w-4 h-4 mr-2" />
            Generate Image
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              openVideoUpload(index);
            }}
            className="text-gray-300 hover:bg-gray-800 focus:bg-gray-800 cursor-pointer"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Video
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </TooltipTrigger>
  <TooltipContent>
    <p>{scene.video_url ? 'Video uploaded' : scene.image_url ? getImageButtonTooltip(scene) : 'Add image or video for this scene'}</p>
  </TooltipContent>
</Tooltip>
```

### 4. Add Hidden File Input (at the end of the component, before closing tags)

```tsx
{/* Hidden file input for video upload */}
<input
  ref={videoFileInputRef}
  type="file"
  accept="video/*"
  onChange={handleVideoFileChange}
  style={{ display: 'none' }}
/>
```

### 5. Add Missing Import

Add `Upload` to imports at the top:
```typescript
import { Upload, Plus, Image, Check, X, Loader2, ... } from "lucide-react";
```

## Testing Steps:

1. Run migration:
   ```sql
   psql -d your_database -f migrations/add_video_url_to_scenes.sql
   ```

2. Build and start:
   ```bash
   npm run build
   npm start
   ```

3. Test flow:
   - Create new story
   - For a scene, click "+ Add Media"
   - Select "Upload Video"
   - Choose video file (< 200MB, < 5 min)
   - Watch progress bar
   - Verify video appears in preview
   - Verify transcript is generated
   - Generate final video
   - Download and verify captions + music work

## Credit Costs:

- Upload Video + Transcribe: 3 credits (covers Whisper API)
- Final Video Generation: 0 credits (free)

Total: 3 credits per uploaded video scene
