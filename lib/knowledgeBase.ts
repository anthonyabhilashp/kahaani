export type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
};

export const categories = [
  { id: 'getting-started', name: '🚀 Getting Started', icon: '🚀' },
  { id: 'story-creation', name: '📖 Story Creation', icon: '📖' },
  { id: 'media-generation', name: '🎬 Media Generation', icon: '🎬' },
  { id: 'advanced-features', name: '⚙️ Advanced Features', icon: '⚙️' },
  { id: 'troubleshooting', name: '❌ Troubleshooting', icon: '❌' },
  { id: 'credits-billing', name: '💳 Credits & Billing', icon: '💳' },
];

export const knowledgeBase: KnowledgeArticle[] = [
  // GETTING STARTED
  {
    id: 'welcome-quick-start',
    title: 'Welcome to Kahaani - Quick Start Guide',
    category: 'getting-started',
    keywords: ['welcome', 'quick start', 'begin', 'introduction', 'getting started', 'first time', 'new user'],
    content: `# Welcome to Kahaani!

Kahaani is an AI-powered story creation platform that transforms your ideas into complete multimedia videos.

## Quick Start (3 Steps):

1. **Create a Story**
   - Click "New Story" button
   - Enter your story idea or prompt
   - Choose number of scenes (5-15)
   - Select voice and video format

2. **Generate Media**
   - Generate images for your scenes
   - Generate audio narration
   - Create your final video

3. **Download & Share**
   - Download your completed video
   - Share on social media

## What You Can Create:
- Educational content
- Social media videos
- Story animations
- Explainer videos
- And much more!

Need help? Search for specific topics or chat with our support team.`,
  },
  {
    id: 'create-first-story',
    title: 'How to Create Your First Story',
    category: 'getting-started',
    keywords: ['create story', 'new story', 'first story', 'start', 'begin'],
    content: `# Creating Your First Story

Follow these steps to create your first story:

## Step 1: Click "New Story"
- Find the orange "New Story" button in your dashboard
- On mobile: Tap the "+" button in the header

## Step 2: Enter Your Story Idea
You have two options:

**Option A: AI Generated**
- Write a prompt describing your story
- Example: "A young wizard discovers a magical book"
- AI will create scenes automatically

**Option B: Blank Story**
- Start with an empty canvas
- Add and edit scenes manually

## Step 3: Configure Settings

**Number of Scenes:**
- Choose 5, 10, or 15 scenes
- More scenes = longer video
- Each scene costs credits for image + audio

**Voice:**
- Select from 8 different AI voices
- Click "Preview" to hear samples
- Choose the one that fits your story

**Format:**
- 9:16 (Portrait) - Perfect for TikTok, Reels
- 16:9 (Landscape) - YouTube, presentations
- 1:1 (Square) - Instagram posts

## Step 4: Create!
- Click "Create Story"
- Wait for AI to generate your scenes
- You'll be taken to the story editor

That's it! Now you're ready to generate images and audio.`,
  },
  {
    id: 'understanding-credits',
    title: 'Understanding Credits',
    category: 'getting-started',
    keywords: ['credits', 'cost', 'pricing', 'how much', 'payment'],
    content: `# Understanding Credits

Credits are Kahaani's currency for generating content.

## How Credits Work:
- 1 Credit = 1 Image OR 1 Audio generation
- Credits are deducted when you generate content
- Check your balance in the sidebar

## Credit Costs:

**Per Scene:**
- Image generation: 1 credit
- Audio generation: 1 credit
- Total per scene: 2 credits

**Example: 5-scene story**
- 5 images = 5 credits
- 5 audio = 5 credits
- Total = 10 credits

**Video generation is FREE!**
Once you have images and audio, creating the final video costs nothing.

## Buying Credits:
1. Click "Buy Credits" in sidebar
2. Choose a package
3. Complete payment
4. Credits added instantly

## Tips to Save Credits:
- Edit scene text before generating images
- Preview voices before generating audio
- Start with fewer scenes to test`,
  },
  {
    id: 'voice-format-selection',
    title: 'Choosing Voice and Video Format',
    category: 'getting-started',
    keywords: ['voice', 'format', 'aspect ratio', 'portrait', 'landscape', 'square', 'narrator'],
    content: `# Choosing Voice and Video Format

Customize your story's voice and video format.

## Voice Selection

**Available Voices: 8 Options**
- Each has unique tone and personality
- Click "Preview" to hear samples
- Choose before creating story

**Voice Characteristics:**
- Some voices are warm and friendly
- Others are dramatic and serious
- Listen to find the perfect match

**Can I change voice later?**
Yes! You can regenerate audio with a different voice anytime.

## Video Format (Aspect Ratio)

**9:16 (Portrait)**
- Best for: TikTok, Instagram Reels, YouTube Shorts
- Vertical phone viewing
- Most popular for social media

**16:9 (Landscape)**
- Best for: YouTube videos, presentations
- Horizontal viewing
- Traditional video format

**1:1 (Square)**
- Best for: Instagram feed posts
- Works on both mobile and desktop
- Versatile option

**Can I change format later?**
You'll need to regenerate images in the new format. Choose wisely at the start!`,
  },

  // STORY CREATION
  {
    id: 'ai-scene-generation',
    title: 'How AI Generates Your Scenes',
    category: 'story-creation',
    keywords: ['ai', 'scenes', 'generate', 'automatic', 'story generation'],
    content: `# How AI Generates Your Scenes

Kahaani uses advanced AI to break your story into visual scenes.

## The Process:

**1. You Provide a Prompt**
Example: "A chef discovers a recipe that brings food to life"

**2. AI Analyzes Your Idea**
- Understands the narrative
- Identifies key moments
- Plans visual scenes

**3. Creates Scene Descriptions**
Each scene gets:
- Clear text description
- Dialogue or narration
- Visual details

**4. Generates Title**
AI creates an engaging title for your story

## Scene Structure:

Each scene contains:
- **Text**: What the narrator says
- **Duration**: Auto-calculated from text length
- **Order**: Numbered sequence

## Tips for Better Results:

✅ **Be specific**: "A young astronaut lands on Mars" is better than "space story"
✅ **Include details**: Mention characters, settings, emotions
✅ **Set the tone**: Add "dramatic" or "funny" if desired
✅ **Avoid very long prompts**: Keep it to 2-3 sentences

❌ **Don't**: Use extremely vague prompts like "make a video"

## What If I Don't Like the Scenes?

You can:
- Edit any scene text manually
- Delete scenes you don't want
- Add new scenes
- Regenerate entirely with a new prompt`,
  },
  {
    id: 'editing-scenes',
    title: 'Editing Scene Text',
    category: 'story-creation',
    keywords: ['edit', 'change', 'modify', 'update', 'scene text'],
    content: `# Editing Scene Text

Customize your scenes by editing the text.

## How to Edit a Scene:

**Desktop:**
1. Find the scene in the timeline (left panel)
2. Click the three-dot menu (⋯)
3. Click "Edit Scene"
4. Modify the text
5. Click "Save"

**Mobile:**
1. Tap the scene thumbnail
2. Tap three-dot menu
3. Select "Edit Scene"
4. Edit text in dialog
5. Tap "Save"

## What Happens After Editing:

**Yellow "Modified" Badge Appears:**
- Indicates scene text changed after media generation
- Image may no longer match text
- Audio narration needs regeneration

**To Update:**
- Click "Image" button → Choose "Regenerate"
- Click "Audio" button → Generates new audio automatically
- This ensures media matches your new text

## Editing Tips:

✅ Edit before generating images/audio (saves credits)
✅ Keep text clear and descriptive
✅ Use proper punctuation for better narration
✅ Preview how it sounds in your head

## Word Timestamps:

When you edit text:
- Word timestamps update automatically
- Captions will work with new text
- Duration recalculates based on length`,
  },
  {
    id: 'add-remove-scenes',
    title: 'Adding and Removing Scenes',
    category: 'story-creation',
    keywords: ['add scene', 'remove scene', 'delete scene', 'new scene', 'more scenes'],
    content: `# Adding and Removing Scenes

Customize your story by adding or removing scenes.

## Adding New Scenes:

**Method 1: Add at End**
1. Scroll to bottom of timeline
2. Click the "+" button below last scene
3. Enter scene text
4. Click "Add Scene"

**Method 2: Insert Between Scenes**
1. Click "+" button between any two scenes
2. Enter scene text
3. New scene appears in that position

**After Adding:**
- Scene numbers update automatically
- Generate image and audio for new scene
- Regenerate video to include it

## Removing Scenes:

**Steps:**
1. Click three-dot menu (⋯) on scene
2. Select "Delete Scene"
3. Confirm deletion (5-second countdown)
4. Scene is permanently removed

**What Gets Deleted:**
- Scene text
- Scene image (if generated)
- Scene audio (if generated)
- This cannot be undone!

**After Deleting:**
- Remaining scenes renumber automatically
- Video becomes outdated
- Regenerate video to update

## Important Notes:

⚠️ **Minimum Scenes**: Keep at least 1 scene
⚠️ **Video Update**: After adding/removing, regenerate video
💡 **Tip**: Edit existing scenes instead of deleting when possible`,
  },
  {
    id: 'blank-stories',
    title: 'Using Blank Stories',
    category: 'story-creation',
    keywords: ['blank', 'empty', 'manual', 'from scratch', 'no ai'],
    content: `# Using Blank Stories

Start with a blank canvas and build your story manually.

## When to Use Blank Stories:

✅ You have pre-written content
✅ You want complete control
✅ You're adapting existing material
✅ You have very specific scene requirements

## Creating a Blank Story:

**Step 1: Toggle to "Blank"**
- In create story dialog
- Switch from "AI Generated" to "Blank"

**Step 2: Create**
- Starts with 1 empty scene
- No prompt needed
- Opens story editor immediately

**Step 3: Add Content**
1. Click into the empty scene
2. Write your scene text
3. Click "+" to add more scenes
4. Continue building your story

## Building Your Story:

**For Each Scene:**
1. Write descriptive text (this becomes narration)
2. Generate image
3. Generate audio
4. Repeat for all scenes

**Tips:**
- Write text that works well when read aloud
- Include visual details for better images
- Keep each scene focused on one moment
- Use proper punctuation

## Blank vs AI-Generated:

**Blank:**
- Full creative control
- More time required
- Perfect for specific needs

**AI-Generated:**
- Fast scene creation
- Can edit after generation
- Good starting point`,
  },

  // MEDIA GENERATION
  {
    id: 'generating-images',
    title: 'Generating Images for Your Scenes',
    category: 'media-generation',
    keywords: ['image', 'generate image', 'picture', 'visual', 'create image'],
    content: `# Generating Images for Your Scenes

Create AI-generated images for each scene.

## How to Generate Images:

**Generate All at Once:**
1. In story editor, look for top bar
2. Click "Generate Images" button
3. Wait for all images to generate
4. Cost: 1 credit per scene

**Generate Individual Scene:**
1. Find scene in timeline
2. Click "Image" button (gray)
3. Single image generates
4. Cost: 1 credit

## Generation Process:

**What Happens:**
1. AI reads your scene text
2. Creates visual interpretation
3. Generates image matching your format (9:16, 16:9, or 1:1)
4. Image appears in scene

**Time:**
- Individual image: ~10-20 seconds
- Full story: ~30-60 seconds

## Regenerating Images:

**When to Regenerate:**
- You edited the scene text
- You want a different visual style
- Image doesn't match your vision

**How:**
1. Click "Image" button on scene
2. Confirm regeneration
3. New image replaces old one
4. Costs 1 credit

## Image Quality Tips:

✅ **Be descriptive**: Include visual details in scene text
✅ **Mention style**: Add "cinematic", "cartoon", "realistic" to prompt
✅ **Describe setting**: Include location, lighting, mood
✅ **Name characters**: Helps maintain consistency

## Troubleshooting:

**Image looks wrong?**
- Edit scene text to be more specific
- Regenerate the image

**Generation failed?**
- Check you have credits
- Try again (no charge if failed)
- Contact support if persists`,
  },
  {
    id: 'generating-audio',
    title: 'Generating Audio Narration',
    category: 'media-generation',
    keywords: ['audio', 'voice', 'narration', 'sound', 'generate audio'],
    content: `# Generating Audio Narration

Create AI voice narration for your scenes.

## Prerequisites:

⚠️ **Images must exist first!**
You must generate images before audio. This is by design.

## How to Generate Audio:

**Generate All at Once:**
1. After images are ready
2. Click "Generate Audio" button in top bar
3. Wait for all audio to generate
4. Cost: 1 credit per scene

**Generate Individual Scene:**
1. Scene must have image first
2. Click "Audio" button
3. Single audio generates
4. Cost: 1 credit

## What Gets Created:

**Audio File Contains:**
- AI voice reading your scene text
- Natural intonation and pacing
- Proper pronunciation
- Word-by-word timestamps (for captions)

**Duration:**
- Automatically calculated from text length
- ~2 words per second reading speed

## Regenerating Audio:

**When to Regenerate:**
- You edited the scene text
- You want different voice
- Audio sounds wrong

**How:**
1. Change voice in story settings (optional)
2. Click "Audio" button on scene
3. New audio replaces old one
4. Costs 1 credit

## Audio Tips:

✅ Use proper punctuation (affects pacing)
✅ Write naturally (how you'd say it)
✅ Avoid complex words that might mispronounce
✅ Preview different voices first

## Troubleshooting:

**Audio won't generate?**
- Check scene has image first
- Verify you have credits
- Ensure scene has text

**Pronunciation wrong?**
- Edit text with phonetic spelling
- Example: "Dr." → "Doctor"`,
  },
  {
    id: 'creating-video',
    title: 'Creating the Final Video',
    category: 'media-generation',
    keywords: ['video', 'generate video', 'final video', 'export', 'create video'],
    content: `# Creating the Final Video

Combine all scenes into your final video.

## Prerequisites:

⚠️ **Required before generating video:**
- ✅ All scenes must have images
- ✅ All scenes must have audio
- ❌ Can't generate video without both

## How to Generate Video:

**Steps:**
1. Ensure all scenes have images + audio
2. Click "Generate Video" button
3. Wait for processing (1-3 minutes)
4. Video appears when ready

**What Happens:**
- Images combined in sequence
- Audio synchronized perfectly
- Captions added (if enabled)
- Effects applied (if set)
- Background music mixed (if added)

## Video is FREE:

💡 Video generation costs 0 credits!
Only images and audio cost credits.

## After Generation:

**Your video includes:**
- All scenes in order
- Smooth transitions
- Audio narration
- Word-by-word captions (if enabled)
- Background music (if added)
- Visual effects (if applied)

**Download:**
- Click "View Video" or external link icon
- Opens video in new tab
- Right-click → "Save video as"

## Regenerating Video:

**When video becomes outdated:**
- Yellow "outdated" indicator appears
- You edited scenes after generating video
- You added/removed scenes
- You changed settings (captions, music, effects)

**To Update:**
- Click "Generate Video" again
- Free to regenerate anytime
- Replaces old video with new one

## Video Quality:

- HD resolution (1080p)
- Matches your chosen format
- Professional output quality`,
  },
  {
    id: 'generation-order',
    title: 'Understanding Generation Order',
    category: 'media-generation',
    keywords: ['order', 'sequence', 'workflow', 'process', 'steps'],
    content: `# Understanding Generation Order

Media must be generated in a specific order.

## The Correct Order:

### 1️⃣ Scenes First
- Create or generate your story scenes
- Edit scene text as needed
- ✅ Can proceed to next step

### 2️⃣ Images Second
- Generate images for all scenes
- Images can't be generated without scenes
- ✅ Must complete before audio

### 3️⃣ Audio Third
- Generate audio narration
- Requires images to exist first
- ✅ Must complete before video

### 4️⃣ Video Last
- Combine everything into final video
- Requires both images AND audio
- ✅ Final output ready

## Why This Order?

**Technical Reasons:**
- Audio timing depends on scene duration
- Video compilation needs both media types
- Ensures synchronization

**Practical Reasons:**
- See visuals before committing to audio
- Make edits before spending credits
- Logical workflow

## Visual Indicators:

**Scene Status:**
- ⚪ Gray "Image" button → Not generated
- ✅ Green "Image" button → Generated
- ⚪ Gray "Audio" button → Not generated
- ✅ Green "Audio" button → Generated
- 🟡 Yellow "Modified" badge → Needs regeneration

## Common Mistakes:

❌ **Trying to generate audio first**
→ Generate images first

❌ **Generating video with missing media**
→ Complete all images + audio first

❌ **Editing after generation**
→ Edit before generating to save credits

## Best Practice Workflow:

1. Create story (AI or blank)
2. **Review and edit all scene text**
3. Generate all images at once
4. **Review images, regenerate if needed**
5. Generate all audio at once
6. **Preview audio, regenerate if needed**
7. Generate final video
8. Download and share!`,
  },

  // ADVANCED FEATURES
  {
    id: 'creating-series',
    title: 'Creating a Series',
    category: 'advanced-features',
    keywords: ['series', 'multiple stories', 'episodes', 'collection'],
    content: `# Creating a Series

Organize related stories into a series.

## What is a Series?

A series is a collection of related stories (episodes):
- Group stories by theme or topic
- Create multi-part narratives
- Organize your content
- Optional: Enable visual consistency

## Creating a New Series:

**Steps:**
1. Go to "Series" tab in dashboard
2. Click "New Series" button
3. Enter series details:
   - Title (required)
   - Description (optional)
   - Enable "Visual Consistency" (optional)
4. Click "Create Series"

## Visual Consistency Option:

**What it does:**
- Characters look identical across episodes
- Environments stay consistent
- Maintains visual style

**When to enable:**
✅ Character-driven stories
✅ Recurring settings
✅ Branded content

**When to skip:**
❌ Standalone topics per episode
❌ Variety content
❌ Different themes each time

⚠️ **Can't change after creation!**

## Adding Stories to Series:

**Method 1: Create in Series**
1. Open a series
2. Click "+" tile or "New Story" button
3. Story automatically added to series

**Method 2: Add Existing Story**
(Feature coming soon)

## Viewing Series:

**Series Dashboard:**
- See all your series
- Shows episode count
- "Visual Consistency" badge if enabled

**Series Detail:**
- View all episodes in order
- Episodes numbered automatically
- Create new episodes easily`,
  },
  {
    id: 'visual-consistency',
    title: 'Visual Consistency Across Episodes',
    category: 'advanced-features',
    keywords: ['consistency', 'character', 'visual', 'same look', 'episodes'],
    content: `# Visual Consistency Across Episodes

Keep characters and environments consistent in your series.

## What is Visual Consistency?

When enabled for a series:
- ✅ Characters have same appearance in every episode
- ✅ Environments look identical
- ✅ Visual style remains consistent
- ✅ Viewers recognize recurring elements

Example: "Ray the rabbit" looks the same in episodes 1, 2, 3, etc.

## How It Works:

**Technical:**
- AI learns character/environment details from first episode
- Applies this "visual memory" to new episodes
- Maintains consistency automatically

**User Experience:**
- You create episodes normally
- No extra steps needed
- Consistency happens behind the scenes

## When to Enable:

✅ **Character-driven narratives**
- Story follows specific characters
- Characters appear in multiple episodes

✅ **Recurring settings**
- Same locations used repeatedly
- Brand/world building important

✅ **Educational series**
- Host/mascot character
- Consistent visual identity

## When to Skip:

❌ **Anthology-style content**
- Different story each episode
- No recurring characters

❌ **Topic-based tutorials**
- Each episode is standalone
- Visual variety preferred

❌ **Compilation content**
- Facts, tips, lists
- No narrative continuity

## Important Notes:

⚠️ **Can't change after series creation**
- Choose carefully when creating series
- Can't toggle on/off later

⚠️ **First episode sets the style**
- Characters/settings in episode 1 become the "template"
- Future episodes match this style

## Visual Indicator:

Series with consistency enabled show:
- 🟢 Green badge with checkmark
- "Visual Consistency" label
- On series tiles and header`,
  },
  {
    id: 'background-music',
    title: 'Adding Background Music',
    category: 'advanced-features',
    keywords: ['music', 'background music', 'soundtrack', 'audio', 'song'],
    content: `# Adding Background Music

Add background music to your videos.

## How to Add Music:

**Steps:**
1. Open your story in editor
2. Find "Background Music" section (right panel)
3. Choose music source:
   - Browse music library
   - Upload your own file
   - Import from URL
4. Adjust volume
5. Regenerate video to apply

## Music Library:

**Preset Music:**
- Curated collection of tracks
- Organized by category (cinematic, upbeat, dramatic, etc.)
- Ready to use
- Click play button to preview

**Your Uploaded Music:**
- Upload MP3 files
- Saved to your library
- Reuse across stories

## Volume Control:

**Slider Range: 0-100**
- 0 = Music is silent
- 30 = Recommended default (music subtle, narration clear)
- 100 = Music at full volume

**Tips:**
- Keep music lower than narration (~20-40)
- Music should enhance, not overpower voice
- Test different levels

## Enabling/Disabling Music:

**Toggle on/off:**
- Checkbox: "Enable background music"
- Unchecked = no music in video
- Checked = music plays throughout

## Removing Music:

**To remove music from story:**
1. Uncheck "Enable background music"
2. Or set volume to 0
3. Regenerate video

## Important:

⚠️ **Must regenerate video** after adding/changing music
⚠️ Music plays for entire video duration
💡 Music loops if video is longer than track

## Supported Formats:

- MP3 (recommended)
- WAV
- M4A

## Tips for Best Results:

✅ Use royalty-free music (if sharing publicly)
✅ Match music mood to story tone
✅ Keep volume lower than narration
✅ Preview before regenerating video`,
  },
  {
    id: 'customizing-captions',
    title: 'Customizing Captions',
    category: 'advanced-features',
    keywords: ['captions', 'subtitles', 'text', 'customize', 'style'],
    content: `# Customizing Captions

Customize word-by-word animated captions for your videos.

## Caption Features:

**Word-by-Word Animation:**
- Words highlight as they're spoken
- Synced perfectly with audio
- Eye-catching effect

**Customization Options:**
- Font family
- Font size
- Font weight (bold, normal)
- Colors (active and inactive)
- Position on screen
- Text transform (uppercase, etc.)
- Words per batch

## How to Customize:

**Steps:**
1. Open story editor
2. Switch to "Captions" view (left panel toggle)
3. Adjust settings:

**Font Settings:**
- Family: Choose font style
- Size: Adjust text size
- Weight: Make bold or light

**Colors:**
- Active color: Currently spoken word
- Inactive color: Other words
- Recommendation: High contrast

**Position:**
- Slider: Distance from bottom
- Higher = captions move up screen

**Batch Size:**
- How many words show at once
- 1-3 words recommended
- More words = less animation

## Enabling/Disabling:

**Toggle captions:**
- Checkbox at top of captions settings
- On = captions in video
- Off = no captions

## Preview:

**See captions while editing:**
- Play preview in center panel
- Captions appear as they will in final video
- Adjust settings and preview again

## Best Practices:

✅ **High contrast colors** (white on dark, colored on light)
✅ **Readable font size** (18-24px recommended)
✅ **Position in safe area** (15-25% from bottom)
✅ **2-3 words per batch** (optimal for readability)

## Mobile Optimization:

- Test captions look good on small screens
- Avoid very large font sizes
- Keep position in visible area

## After Customizing:

⚠️ **Regenerate video** to apply caption changes
Preview shows changes immediately, but video file needs regeneration`,
  },
  {
    id: 'effects-overlays',
    title: 'Adding Effects and Overlays',
    category: 'advanced-features',
    keywords: ['effects', 'overlays', 'animation', 'motion', 'visual effects'],
    content: `# Adding Effects and Overlays

Add motion effects and overlays to enhance your scenes.

## Motion Effects:

**Available Effects:**
- Ken Burns (slow zoom and pan)
- Zoom In (smooth zoom)
- Zoom Out (pulling back)
- Pan Left/Right (camera movement)
- None (static image)

**How to Apply:**
1. In scene timeline
2. Click "Sparkles" icon (✨) on scene
3. Select effect from modal
4. Effect saves automatically

**Preview:**
- Play story preview
- Effect shows on that scene
- Each scene can have different effect

## Overlay Effects:

**What are overlays:**
- Animated elements on top of scene
- Example: Snow, rain, particles, light leaks
- Adds atmosphere and mood

**How to Add:**
1. Scene must have image first
2. Click "Layers" icon on scene
3. Browse overlay library
4. Select overlay
5. Overlay applies to that scene

**Overlay Behavior:**
- Loops throughout scene duration
- Blends with background image
- Maintains scene's motion effect

## Removing Effects:

**Motion Effect:**
- Click sparkles icon
- Select "None"

**Overlay:**
- Click layers icon
- Click "Remove overlay" or select different one

## Best Practices:

✅ **Match effect to scene mood**
- Calm scenes: Slow pan or Ken Burns
- Action scenes: Zoom in/out
- Establishing shots: Static or slow zoom

✅ **Don't overuse**
- Not every scene needs effects
- Variety keeps it interesting

✅ **Preview before committing**
- See how effect looks
- Adjust if too intense

## After Adding:

⚠️ **Regenerate video** to apply effects to final output
Effects show in preview immediately but need video regeneration`,
  },

  // TROUBLESHOOTING
  {
    id: 'video-wont-generate',
    title: 'Video Won\'t Generate - Common Fixes',
    category: 'troubleshooting',
    keywords: ['video', 'wont generate', 'not working', 'failed', 'error', 'stuck'],
    content: `# Video Won't Generate - Common Fixes

Troubleshoot video generation issues.

## Check These First:

### ✅ All Scenes Have Images
**Problem:** Video requires images for every scene

**Solution:**
1. Look for scenes with gray "Image" buttons
2. Click "Generate Images" to generate all
3. Ensure all buttons turn green
4. Try video generation again

### ✅ All Scenes Have Audio
**Problem:** Video requires audio for every scene

**Solution:**
1. Look for scenes with gray "Audio" buttons
2. Click "Generate Audio" to generate all
3. Ensure all buttons turn green
4. Try video generation again

### ✅ Check Your Browser
**Problem:** Old browser cache or compatibility

**Solution:**
1. Refresh the page (Ctrl+F5 or Cmd+Shift+R)
2. Clear browser cache
3. Try in different browser (Chrome recommended)
4. Update browser to latest version

### ✅ Wait for Previous Generation
**Problem:** Video already generating

**Solution:**
1. Look for progress indicator
2. Wait for current generation to complete
3. Don't refresh page during generation
4. Typically takes 1-3 minutes

## Still Not Working?

### Check the Console:
1. Press F12 (developer tools)
2. Look for error messages
3. Screenshot any errors
4. Contact support with screenshot

### Try These Steps:
1. Refresh the page completely
2. Generate video again
3. If still fails, try regenerating one scene's media
4. Contact support if persists

## Prevention Tips:

✅ Generate all media before video
✅ Don't edit scenes after generating media (or regenerate media)
✅ Use stable internet connection
✅ Don't close tab during generation

## Contact Support:

If none of these work:
1. Click "Help" button
2. Click "Chat with Support"
3. Provide:
   - Story ID (from URL)
   - What you tried
   - Any error messages`,
  },
  {
    id: 'image-generation-failed',
    title: 'Image Generation Failed',
    category: 'troubleshooting',
    keywords: ['image', 'failed', 'error', 'wont generate', 'not working'],
    content: `# Image Generation Failed

Troubleshoot image generation issues.

## Common Causes & Fixes:

### ❌ Out of Credits
**Problem:** No credits remaining

**Solution:**
1. Check credit balance in sidebar
2. Click "Buy Credits"
3. Purchase a package
4. Try generating again

### ❌ Scene Text Too Short/Empty
**Problem:** AI needs text to create image

**Solution:**
1. Edit the scene
2. Add descriptive text (at least 5-10 words)
3. Save changes
4. Try generating again

### ❌ Network Issue
**Problem:** Unstable connection

**Solution:**
1. Check your internet connection
2. Refresh the page
3. Try generating again
4. Use wired connection if possible

### ❌ Server Overload
**Problem:** High traffic on service

**Solution:**
1. Wait 30 seconds
2. Try again
3. Generation often works on retry

## If Image Generates But Looks Wrong:

### Scene text unclear:
1. Edit scene text to be more descriptive
2. Include visual details
3. Regenerate image

### Wrong style:
1. Add style keywords to scene text
2. Example: "cinematic", "cartoon", "realistic"
3. Regenerate image

## Partial Generation:

**Some images generated, some failed:**
1. Failed scenes keep gray button
2. Click each failed scene's "Image" button individually
3. Only costs credits for failed scenes

## Prevention:

✅ Ensure stable internet
✅ Write clear, descriptive scene text
✅ Check credit balance before starting
✅ Don't close tab during generation

## Still Having Issues?

Contact support with:
- Story ID
- Which scene(s) failed
- Any error messages
- Screenshot of the issue`,
  },
  {
    id: 'audio-not-playing',
    title: 'Audio Not Playing',
    category: 'troubleshooting',
    keywords: ['audio', 'not playing', 'no sound', 'silent', 'muted'],
    content: `# Audio Not Playing

Fix audio playback issues.

## Quick Checks:

### 🔊 Device Volume
**Check:**
1. Device volume is up
2. Not on silent/mute
3. Headphones connected properly (if using)

### 🔊 Browser Audio
**Check:**
1. Browser tab not muted (look for 🔇 icon)
2. Site permissions allow audio
3. Right-click tab → Unmute if needed

### 🔊 In-App Volume
**Check:**
1. Look for volume icon in preview controls
2. Ensure not set to 0
3. Slider should be above 50%

## Common Issues:

### "Play" Button Not Working
**Problem:** Preview won't start

**Solution:**
1. Refresh the page
2. Audio might still be loading
3. Wait for loading spinner to finish
4. Try clicking play again

### Audio in Preview But Not Final Video
**Problem:** Preview works, video is silent

**Solution:**
1. Check background music volume isn't at 100% (overpowering narration)
2. Regenerate video
3. Download video again (don't use cached version)

### Mobile Audio Issues
**Problem:** Audio doesn't play on mobile

**Solution:**
1. Enable audio permissions for browser
2. Ensure phone not on silent mode
3. Try headphones
4. Refresh the page
5. Use different browser (Chrome/Safari)

## Browser-Specific Issues:

### Safari (iOS/Mac):
- May require user interaction before audio
- Click play button (don't autoplay)
- Check Safari audio settings

### Chrome:
- Check site permissions
- Settings → Privacy → Site Settings → Sound

### Firefox:
- Check if audio is blocked
- Click shield icon → Allow audio

## Still No Audio?

**Try:**
1. Different browser
2. Different device
3. Download video and play locally
4. Contact support

## Report Issue:

Include:
- Device and browser
- Whether preview or final video
- Any error messages
- Story ID`,
  },
  {
    id: 'out-of-credits',
    title: 'Out of Credits',
    category: 'troubleshooting',
    keywords: ['credits', 'out of credits', 'need more', 'buy credits'],
    content: `# Out of Credits

What to do when you run out of credits.

## Check Your Balance:

**Location:**
- Sidebar on desktop (left side)
- Mobile menu (hamburger icon)
- Shows current credit balance

## Buying More Credits:

**Steps:**
1. Click "Buy Credits" button in sidebar
2. Choose a credit package:
   - Different sizes available
   - Larger packages = better value
3. Complete secure payment
4. Credits added instantly to account

**Payment Methods:**
- Credit/debit cards
- Secure checkout
- Instant processing

## How Many Credits Do I Need?

**Per Story:**
- 5 scenes = 10 credits (5 images + 5 audio)
- 10 scenes = 20 credits (10 images + 10 audio)
- 15 scenes = 30 credits (15 images + 15 audio)

**Remember:**
- Video generation is FREE
- Only images and audio cost credits
- Regenerating costs credits

## Credit-Saving Tips:

✅ **Edit before generating**
- Review all scene text first
- Make changes before generating media
- Avoids regeneration costs

✅ **Start small**
- Create 5-scene story first
- Extend if needed
- Test before committing to large story

✅ **Preview voices**
- Listen to voice samples before choosing
- Pick right voice first time
- Avoid regenerating audio

## What If Payment Fails?

**Try:**
1. Check card details are correct
2. Ensure sufficient funds
3. Try different payment method
4. Contact support if persists

## Bulk Credits:

**For Heavy Users:**
- Larger packages available
- Better per-credit pricing
- Never run out mid-project

## Credits Don't Expire:

💡 Buy credits anytime
💡 Use whenever you want
💡 No expiration date`,
  },
  {
    id: 'browser-compatibility',
    title: 'Browser Compatibility Issues',
    category: 'troubleshooting',
    keywords: ['browser', 'compatibility', 'not working', 'chrome', 'safari', 'firefox'],
    content: `# Browser Compatibility Issues

Ensure your browser works with Kahaani.

## Recommended Browsers:

✅ **Best Experience:**
- **Chrome** (latest version) - Recommended
- **Edge** (latest version) - Recommended

✅ **Fully Supported:**
- **Safari** (latest version)
- **Firefox** (latest version)
- **Brave** (latest version)

❌ **Not Supported:**
- Internet Explorer (any version)
- Very old browser versions

## Update Your Browser:

**Chrome:**
1. Menu (⋮) → Help → About Google Chrome
2. Updates automatically
3. Restart browser

**Safari:**
1. System Preferences → Software Update
2. Update macOS to get latest Safari

**Firefox:**
1. Menu (≡) → Help → About Firefox
2. Updates automatically
3. Restart browser

## Mobile Browsers:

**iOS:**
- Safari (built-in) - Recommended
- Chrome for iOS

**Android:**
- Chrome (built-in) - Recommended
- Firefox for Android

## Common Browser Issues:

### Slow Performance
**Solution:**
1. Close unnecessary tabs
2. Clear browser cache
3. Disable heavy extensions
4. Update to latest version

### Features Not Working
**Solution:**
1. Enable JavaScript (required)
2. Allow cookies (required)
3. Check no ad-blockers blocking features
4. Disable "strict" privacy modes

### Media Won't Load
**Solution:**
1. Allow media autoplay
2. Check site permissions
3. Disable aggressive content blockers

## Browser Settings to Check:

### JavaScript (Must Be Enabled):
- Chrome: Settings → Privacy → Site Settings → JavaScript
- Safari: Preferences → Security → Enable JavaScript

### Cookies (Must Be Allowed):
- Chrome: Settings → Privacy → Cookies
- Safari: Preferences → Privacy → Cookies

### Pop-ups (Allow for Kahaani):
- Some features open new tabs
- Allow pop-ups from kahaani.com

## Still Having Issues?

**Try:**
1. Incognito/Private mode (disables extensions)
2. Different browser entirely
3. Different device
4. Contact support with browser details`,
  },

  // CREDITS & BILLING
  {
    id: 'how-credits-work',
    title: 'How Credits Work',
    category: 'credits-billing',
    keywords: ['credits', 'how credits work', 'credit system', 'usage'],
    content: `# How Credits Work

Understand Kahaani's credit system.

## Credit Basics:

**1 Credit = 1 Generation**
- 1 image generation = 1 credit
- 1 audio generation = 1 credit

**Video Generation = FREE**
- Costs 0 credits
- Unlimited video regeneration

## Per-Story Cost:

**5-Scene Story:**
- 5 images × 1 credit = 5 credits
- 5 audio × 1 credit = 5 credits
- Total: 10 credits

**10-Scene Story:**
- 10 images × 1 credit = 10 credits
- 10 audio × 1 credit = 10 credits
- Total: 20 credits

**15-Scene Story:**
- 15 images × 1 credit = 15 credits
- 15 audio × 1 credit = 15 credits
- Total: 30 credits

## When Credits Are Deducted:

✅ **Charged:**
- Generating new image
- Generating new audio
- Regenerating existing media

❌ **Not Charged:**
- Creating story (just text)
- Editing scene text
- Generating video
- Viewing/downloading content

## Credit Balance:

**Where to Check:**
- Desktop: Sidebar (left side)
- Mobile: Menu (hamburger icon)
- Shows current available credits

**Updates:**
- Real-time balance
- Decreases when you generate
- Increases when you buy

## No Credits? No Problem:

If balance = 0:
1. Can't generate new media
2. Can still edit existing content
3. Can still download videos
4. Buy credits when ready

## Credits Never Expire:

💡 Buy anytime
💡 Use anytime
💡 Keep forever

## Refunds:

⚠️ Credits are non-refundable once used
⚠️ Failed generations don't charge credits
💡 Test with small stories first`,
  },
  {
    id: 'buying-credits',
    title: 'Buying More Credits',
    category: 'credits-billing',
    keywords: ['buy', 'purchase', 'payment', 'add credits', 'more credits'],
    content: `# Buying More Credits

Purchase credits to create more content.

## How to Buy:

**Steps:**
1. Click "Buy Credits" button
   - Desktop: Sidebar
   - Mobile: Menu
2. Choose a credit package
3. Complete secure checkout
4. Credits added instantly

## Credit Packages:

Different package sizes available:
- Starter pack
- Popular pack
- Pro pack
- Enterprise pack

**Larger Packages:**
- Better value per credit
- Save money with bulk purchase
- Perfect for regular creators

## Payment Process:

**Secure Checkout:**
1. Enter payment details
2. Secure encryption (SSL)
3. Instant processing
4. Email confirmation

**Payment Methods:**
- All major credit cards
- Debit cards
- Secure payment processor

## After Purchase:

**Immediate Access:**
- Credits appear in balance instantly
- Start creating right away
- No waiting period

**Confirmation:**
- Email receipt sent
- Transaction recorded in account
- Check credit history anytime

## Failed Payment?

**If payment doesn't go through:**
1. Check card details are correct
2. Ensure sufficient funds
3. Check with your bank (some block online purchases)
4. Try different card
5. Contact support if issue persists

## Bulk Purchases:

**Need lots of credits?**
- Contact support for custom packages
- Better rates for high volume
- Perfect for agencies/businesses

## Security:

✅ PCI-compliant payment processing
✅ Encrypted transactions
✅ No card details stored on our servers
✅ Secure checkout page

## Questions About Billing?

Contact support:
- Billing questions
- Invoice requests
- Refund inquiries
- Package recommendations`,
  },
  {
    id: 'credit-cost-breakdown',
    title: 'Credit Cost Breakdown',
    category: 'credits-billing',
    keywords: ['cost', 'pricing', 'how much', 'breakdown', 'calculation'],
    content: `# Credit Cost Breakdown

Detailed breakdown of credit costs.

## Per-Generation Costs:

### Images: 1 Credit Each
- Any size/format (9:16, 16:9, 1:1)
- Any style
- Any complexity
- Regeneration costs 1 credit

### Audio: 1 Credit Each
- Any voice
- Any length (based on text)
- Regeneration costs 1 credit

### Video: FREE
- Always free
- Any length
- Unlimited regenerations
- Any format

## Story Cost Examples:

### Small Story (5 scenes):
  5 scenes × 2 credits/scene = 10 credits
  - 5 images = 5 credits
  - 5 audio = 5 credits
  - 1 video = 0 credits
  Total: 10 credits

### Medium Story (10 scenes):
  10 scenes × 2 credits/scene = 20 credits
  - 10 images = 10 credits
  - 10 audio = 10 credits
  - 1 video = 0 credits
  Total: 20 credits

### Large Story (15 scenes):
  15 scenes × 2 credits/scene = 30 credits
  - 15 images = 15 credits
  - 15 audio = 15 credits
  - 1 video = 0 credits
  Total: 30 credits

## Additional Costs:

### Editing & Regeneration:
- Edit scene text: FREE
- Regenerate 1 image: 1 credit
- Regenerate 1 audio: 1 credit
- Regenerate video: FREE

### Series:
- Same costs as regular stories
- No extra charge for series features
- Visual consistency: FREE

### Advanced Features:
- Captions: FREE
- Background music: FREE
- Effects: FREE
- Overlays: FREE

## Cost-Saving Strategies:

✅ **Edit before generating**
Review all text before generating media

✅ **Choose scene count wisely**
Start with 5 scenes to test

✅ **Preview voices**
Pick the right voice first time

✅ **Regenerate selectively**
Only regenerate scenes that really need it

✅ **Use blank stories for precision**
Write exactly what you want

## What Doesn't Cost Credits:

✅ Creating stories
✅ Editing text
✅ Organizing series
✅ Viewing content
✅ Downloading videos
✅ Deleting stories
✅ Changing settings

## Budget Planning:

**Weekly Creator (4 stories/week):**
- 4 × 10 credits = 40 credits/week
- ~160 credits/month

**Daily Creator (1 story/day):**
- 7 × 10 credits = 70 credits/week
- ~280 credits/month

**Bulk Creator (10 stories/week):**
- 10 × 10 credits = 100 credits/week
- ~400 credits/month`,
  },
];
