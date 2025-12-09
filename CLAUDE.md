# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL RULES - READ FIRST

**BEFORE doing ANYTHING:**

1. **NEVER create new files without checking existing ones first**
   - Search for similar components/patterns in the codebase
   - Reuse existing UI components from `components/ui/`
   - Check if shadcn components are already installed

2. **NEVER install packages without checking package.json first**
   - Run `grep <package-name> package.json` before `npm install`
   - Ask user before installing anything new

3. **ALWAYS reuse existing patterns**
   - Check how dialogs, buttons, toasts are already implemented
   - Follow the same styling patterns (dark theme, orange accents)
   - Don't reinvent components that already exist

4. **Components & Styling**
   - Already using shadcn/ui components
   - Already have toast system (hooks/use-toast.ts + components/ui/toast.tsx + components/ui/toaster.tsx)
   - Dark theme with orange accents (orange-600, gray-900, gray-800)
   - DO NOT create custom toast systems or styling from scratch

5. **When in doubt, ASK before changing things**

## 🚨 MANDATORY BEHAVIOR PROTOCOL - NO EXCEPTIONS

**THIS IS NON-NEGOTIABLE. FOLLOW THIS EXACT WORKFLOW FOR EVERY SINGLE CHANGE:**

### Step 1: READ THE CODE COMPLETELY
- Use Read tool to read ENTIRE relevant file(s)
- Don't skim - read every line of the relevant section
- Look for ALL related code (e.g., if fixing mobile view, check if there are separate mobile/desktop sections)
- Understand the complete context before proceeding

### Step 2: DEMONSTRATE UNDERSTANDING
Before making ANY change, you MUST write out:
1. **What I read**: "I read [file] lines [X-Y]"
2. **What I understand**: Explain the current implementation in your own words
3. **Root cause**: What exactly is causing the issue
4. **My proposed fix**: Specific change with exact line numbers
5. **Ask for permission**: "May I proceed with this change?"

### Step 3: WAIT FOR APPROVAL
- NEVER make a change without explicit user approval
- If user says "go ahead" or "yes" or "do it" - THEN proceed
- If unclear, ask clarifying questions

### Step 4: MAKE THE CHANGE
- Make ONLY the approved change
- Don't add "improvements" or "optimizations" that weren't discussed
- One file at a time unless explicitly told otherwise

### Critical Rules:
- ❌ **NEVER assume** - Always verify from code
- ❌ **NEVER make changes without permission** - Always ask first
- ❌ **NEVER modify multiple files** claiming each will fix an issue
- ❌ **NEVER skip reading the code** - Even if you think you know the fix
- ✅ **ALWAYS read the entire relevant section** - Not just snippets
- ✅ **ALWAYS explain your understanding** - Show you've read and comprehend the code
- ✅ **ALWAYS ask permission** - Every single time, no exceptions

### Real Example of Correct Behavior:

**User:** "The mobile homepage videos aren't working"

**❌ WRONG Response:**
"Let me fix that by adding muted attribute..." [makes change without reading/asking]

**✅ CORRECT Response:**
"Let me read the LandingPage.tsx file first to understand the issue.

[Reads file]

I read LandingPage.tsx lines 331-393. I see there's a mobile video section using:
- `preload="auto"`
- `playsInline`
- But no `poster` attribute

I also notice there are TWO separate video sections:
- Lines 248-329: Desktop 3D stacked view
- Lines 331-393: Mobile simple row

Root cause: iOS Safari doesn't auto-load video thumbnails without a poster image or specific attributes.

Proposed fix: Add `muted` and change `preload="auto"` to `preload="metadata"` on the mobile video section (line 343).

May I proceed with this change?"

### Why This Matters:
- User's subscription depends on quality of work
- Making assumptions wastes time and causes frustration
- Reading code prevents obvious mistakes
- Asking permission shows respect and builds trust

**IF YOU VIOLATE THIS PROTOCOL, YOU ARE FAILING YOUR PRIMARY FUNCTION.**

## Project Overview

Kahaani is an AI-powered story generation platform built with Next.js (Pages Router), TypeScript, and Supabase. It transforms user prompts into complete multimedia stories with scenes, images, audio narration, and video output.

## Development Commands

```bash
# Install dependencies
npm install

# Development server (port 3000)
npm run dev

# Debug mode
npm run debug

# Build for production
npm build

# Start production server
npm start
```

## Docker Deployment

### ⚠️ CRITICAL: Platform Architecture for VPS Deployment

**ALWAYS use `--platform linux/amd64` when building Docker images for VPS deployment (Hostinger/Hetzner).**

Most VPS servers use AMD64 architecture, but Mac M1/M2/M3 uses ARM64. If you forget the platform flag, the image will build successfully but will fail on the server with "exec format error".

### Quick Deployment

Use the deployment script (recommended):

```bash
./deploy.sh
```

This script:
- Builds Docker image with correct platform flag (`--platform linux/amd64`)
- Pushes to Docker Hub
- Displays VPS deployment instructions

### Manual Deployment

**1. Build for AMD64:**
```bash
# CRITICAL: Do NOT forget --platform flag!
docker build --platform linux/amd64 -t anthonyabhilash/kahaani:latest .
```

**2. Push to Docker Hub:**
```bash
docker push anthonyabhilash/kahaani:latest
```

**3. Deploy on VPS:**
```bash
# On Hostinger/Hetzner server via SSH

# Pull image
docker pull anthonyabhilash/kahaani:latest

# Stop old container
docker stop kahaani && docker rm kahaani

# Run new container
docker run -d --name kahaani -p 3000:3000 --env-file .env --restart unless-stopped anthonyabhilash/kahaani:latest

# Check logs
docker logs -f kahaani
```

### Troubleshooting

**"exec format error" - Container exits immediately:**
- **Cause**: Image built for wrong architecture (ARM64 instead of AMD64)
- **Solution**: Rebuild with `docker build --platform linux/amd64`

**Container keeps restarting:**
```bash
docker logs kahaani  # Check error logs
```

Common causes:
- Missing environment variables in `.env` file
- Invalid Supabase credentials
- Port already in use

### Files

- `Dockerfile` - Multi-stage build (base → builder → runner)
- `.dockerignore` - Excludes node_modules, .next, logs, tmp
- `deploy.sh` - Automated deployment script with platform flag

## Architecture & Data Flow

### Generation Pipeline

The app follows a **user-controlled, progressive generation flow** to provide cost awareness and quality control:

1. **Story Scenes** (`/api/generate_scenes`)
   - User provides a text prompt
   - LLM (via OpenRouter) generates 3-6 visual scenes + title
   - Scenes stored in `scenes` table with `order` field

2. **Image Generation** (`/api/generate_images`) - Manual trigger
   - User clicks "Generate Images" button when satisfied with scenes
   - Generates one image per scene using configured IMAGE_MODEL
   - Images stored in Supabase Storage (`images` bucket)
   - Images match exact video dimensions from env vars

3. **Audio Generation** (`/api/generate_audio`) - Manual trigger
   - Enabled only after images exist
   - Creates narration audio for each scene
   - Stored in Supabase Storage (`audio` bucket)

4. **Video Generation** (`/api/generate_video`) - Manual trigger
   - Enabled only after audio exists
   - Uses FFmpeg to combine images + audio with timing
   - Outputs final video to Supabase Storage (`videos` bucket)

### Key Design Principles

- **No automatic generation**: Users explicitly trigger each expensive operation
- **Progressive enhancement**: Each step builds on the previous (scenes → images → audio → video)
- **Cost visibility**: UI shows what's ready vs what needs generation
- **File cleanup**: Old files are removed from storage when regenerating
- **Change tracking**: Hash-based system detects when videos become outdated after scene edits

## Database Schema (Supabase)

### Tables

- `stories`: Story metadata (`id`, `title`, `prompt`, `status`, `created_at`, `updated_at`)
- `scenes`: Individual scenes (`id`, `story_id`, `text`, `order`, `image_url`, `audio_url`, `duration`, `last_modified_at`)
- `images`: Scene images (`id`, `story_id`, `scene_order`, `image_url`)
- `audio`: Scene audio (`id`, `scene_id`, `story_id`, `audio_url`, `duration`)
- `videos`: Final videos (`id`, `story_id`, `video_url`, `scenes_hash`, `duration`, `created_at`)
  - `scenes_hash`: MD5 hash to detect scene changes (invalidates video when scenes are edited)

### Storage Buckets

- `images/` - Scene images
- `audio/` - Scene narration
- `videos/` - Final rendered videos

## Configuration (.env.local)

Required environment variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI APIs
OPENROUTER_API_KEY=        # Scene generation
OPENAI_API_KEY=            # Alternative image generation
ELEVENLABS_API_KEY=        # Audio narration

# Model configuration
PROVIDER=openrouter
SCENE_MODEL=mistralai/mistral-7b-instruct
IMAGE_MODEL=google/gemini-2.5-flash-image

# Video dimensions (must match for images + video)
ASPECT_RATIO=9:16          # Portrait (9:16), Landscape (16:9), or Square (1:1)
VIDEO_WIDTH=1080
VIDEO_HEIGHT=1920
```

## Project Structure

```
/pages
  /api              # API routes for generation pipeline
    generate_scenes.ts    # LLM scene generation
    generate_images.ts    # Image generation per scene
    generate_audio.ts     # Audio narration per scene
    generate_video.ts     # FFmpeg video assembly
    get_stories.ts        # Fetch all stories
    get_story_details.ts  # Fetch story + scenes + media
    edit_scene.ts         # Update scene text
    delete_scene.ts       # Remove a scene
  index.tsx         # Dashboard/homepage (story list)
  story/[id].tsx    # Story detail page with 3-panel layout
  _app.tsx          # App wrapper with ThemeProvider

/lib
  supabaseClient.ts  # Client-side Supabase
  supabaseAdmin.ts   # Server-side Supabase (service role)
  logger.ts          # JobLogger for file-based logging
  utils.ts           # Utility functions

/components
  /ui               # shadcn/ui components (button, card, dialog, input)
  DeleteConfirmDialog.tsx

/tmp/{story_id}/    # Temporary files during video generation
/logs/              # Server-side job logs (log_{story_id}_{context}.txt)
```

## Important Technical Details

### FFmpeg Video Generation ⚠️ CRITICAL - READ CAREFULLY

**BEFORE modifying ANY video generation code, understand these critical requirements:**

#### Video Concatenation - Concat FILTER vs Demuxer

**🚨 NEVER switch back to concat demuxer - it breaks with different frame rates!**

- **Current (CORRECT)**: Uses concat **FILTER** (`filter_complex`)
  - Handles videos with different frame rates (23.976fps, 30fps, etc.)
  - Required for user-uploaded YouTube videos
  - Properly concatenates scenes with correct total duration

- **Previous (BROKEN)**: Used concat **DEMUXER** (`-f concat`)
  - Only works if ALL videos have identical codec parameters
  - Silently failed with different frame rates
  - Resulted in truncated videos (e.g., 21s instead of 32s)

**Location**: `generate_video.ts` lines 843-894

#### Video Duration Management - DO NOT REMOVE

**🚨 NEVER remove `.setDuration()` from uploaded video processing!**

```javascript
// ✅ CORRECT - Trims uploaded video to match scene duration
ffmpeg(scene.videoPath!)
  .setStartTime(0)
  .setDuration(scene.duration)  // ← CRITICAL! Do not remove!
```

**Why this matters:**
- User uploads 30s video but scene duration is 10s
- Without `.setDuration()`: Video plays for 30s, audio ends at 10s → "rushed" appearance
- With `.setDuration()`: Video trimmed to 10s, matches audio perfectly

**Location**: `generate_video.ts` lines 447-472

#### Video Dimensions - Aspect Ratio Specific

**🚨 DO NOT force all aspect ratios to use same dimensions!**

Each aspect ratio uses specific 4K dimensions:
- **9:16 portrait**: 2160 x 3840 (vertical/TikTok)
- **16:9 landscape**: 3840 x 2160 (horizontal/YouTube)
- **1:1 square**: 3840 x 3840 (Instagram)

These are hardcoded in both `generate_images.ts` AND `generate_video.ts` and MUST match.

**Location**:
- `generate_images.ts` lines 465-480
- `generate_video.ts` lines 400-418

#### Font Scaling System - Preview vs Video

**Captions and watermark MUST scale proportionally:**

```javascript
// Scaling factor = video width / preview width
const fontSizeScalingFactor = width / previewDimensions.width;

// For 1:1 aspect ratio:
// 3840px (video) / 400px (preview) = 9.6x scale

// Caption: 18px (preview) × 9.6 = 173pt (video)
// Watermark: 14px (preview) × 9.6 = 134pt (video)
```

**Location**: `generate_video.ts` lines 420-421, 788-804, 859-863

#### Temporary Files & Processing

- Individual clips: `/tmp/{story_id}/clip-{index}.mp4`
- Audio files: `/tmp/{story_id}/scene-{index}-audio.mp3`
- Padded audio: `/tmp/{story_id}/padded-audio-{index}.m4a`
- Final output: `/tmp/{story_id}/final-video-{story_id}.mp4`
- Cleanup happens automatically after upload to Supabase

### Logging System

- `JobLogger` writes to `/logs/log_{story_id}_{context}.txt`
- Each API route creates a logger with story ID + context
- Helps debug generation issues across the pipeline

### Image Consistency

- `generate_images.ts` extracts character info from scenes to maintain visual consistency
- All images generated with same dimensions as final video (VIDEO_WIDTH x VIDEO_HEIGHT)
- Aspect ratio configured via ASPECT_RATIO env var

### Path Aliasing

- `@/*` maps to project root via tsconfig.json
- Example: `import { Button } from "@/components/ui/button"`

### Next.js Configuration

- Uses Pages Router (not App Router)
- Images: unoptimized, localhost domain allowed
- SWC minification enabled
- React strict mode enabled

## UI Layout (Story Detail Page)

The story detail page uses a professional 3-panel layout:

1. **Left Sidebar**: Scene thumbnails browser
2. **Center Panel**: Video/image preview (clean, no overlapping controls)
3. **Right Sidebar**: Organized sections
   - Generation buttons (Images, Audio, Video with state indicators)
   - Audio player
   - Future: Captions, Background customization

## Font Management System

### Overview

All caption fonts are managed through a centralized system that ensures fonts available in the UI are installed on the server during Railway deployment.

### Components

1. **`lib/fonts.ts`** - Single source of truth for all fonts
   - Contains `CAPTION_FONTS` array with font metadata
   - Includes font name, category, system font flag, file name, and Google Fonts path
   - Exports `getFontsByCategory()` for UI rendering

2. **`pages/story/[id].tsx`** - Uses centralized font list
   - Imports and uses `getFontsByCategory()` to render font dropdown
   - No hardcoded font list - all fonts come from `lib/fonts.ts`

3. **`nixpacks.toml`** - Railway deployment configuration
   - Downloads all non-system fonts during build
   - Installs fonts to `/root/.fonts/`
   - Runs `fc-cache -f -v` to refresh font cache for FFmpeg

4. **`scripts/generate-font-install.js`** - Code generator
   - Reads `lib/fonts.ts` and generates nixpacks.toml installation commands
   - Run manually when adding new fonts: `npm run generate-font-install`

5. **`scripts/validate-fonts.js`** - Build-time validator
   - Checks that all fonts in `lib/fonts.ts` are configured in `nixpacks.toml`
   - Runs automatically before every build (prebuild script)
   - Fails build if fonts are missing from installation config

### Adding a New Font

**IMPORTANT: Follow these steps EXACTLY to avoid font mismatch issues:**

1. **Add font to `lib/fonts.ts`**:
   ```typescript
   {
     name: "Comic Sans MS",           // Display name in UI
     category: "Display & Handwriting",
     systemFont: false,                // false = needs download
     fileName: "ComicSansMS",          // No spaces, for file paths
     fontPath: "apache/comicsansms"    // Path in Google Fonts repo
   },
   ```

2. **Generate installation commands**:
   ```bash
   npm run generate-font-install
   ```
   This outputs the curl commands needed for nixpacks.toml

3. **Update `nixpacks.toml`**:
   - Copy the output from step 2
   - Replace the `[phases.install] cmds` array
   - Keep `npm ci`, `mkdir`, and `fc-cache` commands

4. **Validate**:
   ```bash
   npm run validate-fonts
   ```
   Should show: ✅ All fonts are properly configured

5. **Test build**:
   ```bash
   npm run build
   ```
   Validation runs automatically (prebuild script)

### Why This System Exists

**Problem**: Users select fonts in the UI, but if those fonts aren't installed on the Railway server, FFmpeg falls back to default fonts, causing mismatch between preview and generated video.

**Solution**:
- Centralized font configuration prevents drift between UI and server
- Automatic validation fails build if fonts are missing
- Generator script makes it easy to update nixpacks.toml

### Validation Behavior

The validation script (`scripts/validate-fonts.js`) runs automatically before every build:

```bash
npm run build
# → prebuild runs validate-fonts.js
# → if validation fails, build stops with error
# → if validation passes, build continues
```

**Manual validation**:
```bash
npm run validate-fonts
```

**What it checks**:
- All non-system fonts in `lib/fonts.ts` have corresponding curl commands in `nixpacks.toml`
- Looks for `{fileName}-Regular.ttf` in nixpacks.toml content
- Exits with code 1 (fails build) if any fonts are missing

### System vs. Downloadable Fonts

**System fonts** (already on server, no download needed):
- Arial, Helvetica, Verdana, Times New Roman, Georgia, Courier New
- Set `systemFont: true` in `lib/fonts.ts`

**Downloadable fonts** (from Google Fonts):
- All others (Montserrat, Poppins, Roboto, etc.)
- Set `systemFont: false` and provide `fileName` and `fontPath`
- Downloaded during Railway build from GitHub repo

### Troubleshooting

**Error: "Font not available on server"**
1. Check if font exists in `lib/fonts.ts`
2. Run `npm run validate-fonts` to see if it's configured
3. If missing, run `npm run generate-font-install` and update nixpacks.toml
4. Rebuild and deploy

**Font looks different in preview vs video**
- Likely means font is not installed on server
- Check Railway build logs for font download errors
- Verify font file names match Google Fonts repo structure

## Common Workflows

### Adding a New Generation Step

1. Create API route in `/pages/api/`
2. Add JobLogger for debugging
3. Update UI in `/pages/story/[id].tsx` to trigger the route
4. Update button states based on generation status
5. Add cleanup logic for old files if regenerating

### Debugging Generation Issues

1. Check `/logs/log_{story_id}_{context}.txt` for detailed logs
2. Verify env vars are set correctly
3. Check Supabase Storage permissions
4. Inspect network tab for API responses

### Modifying Video Dimensions

**⚠️ WARNING: Dimensions are aspect-ratio-specific, NOT from env vars!**

The dimensions are **hardcoded per aspect ratio** in both files:
- `generate_images.ts` lines 465-480
- `generate_video.ts` lines 400-418

**DO NOT** try to use `process.env.VIDEO_WIDTH/VIDEO_HEIGHT` for all aspect ratios!

## Video Generation - Lessons Learned 🚨

**These are REAL mistakes that were made and caused production issues:**

### Mistake #1: Removed `.setDuration()` from video processing
**What happened**: Thought videos should play at "natural duration" without trimming
**Result**: 30s uploaded video played fully while 10s audio ended early → "rushed" video
**Fix**: Always trim videos with `.setDuration(scene.duration)` to match audio
**Never do this again!**

### Mistake #2: Used concat demuxer instead of filter
**What happened**: Used `-f concat` (demuxer) which requires identical codec params
**Result**: Videos with different frame rates (23.976fps, 30fps) concatenated incorrectly → 21s instead of 32s
**Fix**: Use concat **filter** (`filter_complex`) which handles different frame rates
**Never switch back to demuxer!**

### Mistake #3: Tried to force env vars for all aspect ratios
**What happened**: Replaced aspect-ratio-specific dimensions with `process.env.VIDEO_WIDTH`
**Result**: Would force 9:16 portrait (2160x3840) and 16:9 landscape (3840x2160) to use same dimensions
**Fix**: Keep hardcoded dimensions per aspect ratio in both image and video generation
**Never assume env vars work for everything!**

### Mistake #4: Didn't scale watermark font size
**What happened**: Hardcoded watermark to 20pt regardless of video resolution
**Result**: Tiny watermark on 4K video (3840px) compared to preview (400px)
**Fix**: Scale watermark using same `fontSizeScalingFactor` as captions
**Always scale UI elements proportionally!**

### Key Takeaway
**Video generation is complex with many interdependent parts:**
- Duration management (audio, video, trimming)
- FFmpeg concat methods (demuxer vs filter)
- Aspect ratios and dimensions
- Font scaling between preview and final video

**NEVER change video generation logic without:**
1. Reading ALL related code completely
2. Understanding the full architecture
3. Testing with ACTUAL uploaded videos
4. Verifying final video duration and quality

## Debugging UI Issues - CRITICAL LESSONS

### BEFORE Making Any Changes

1. **Identify the EXACT location of the issue first**
   - Is it in a Dialog component or inline page content?
   - Which file contains the problematic code?
   - Use browser DevTools to inspect the actual DOM element
   - Don't assume - verify the component path

2. **Understand the root cause BEFORE touching code**
   - Why is the flickering/animation happening?
   - Is it React re-rendering? CSS transitions? Dialog animations?
   - Check if it's a state change issue or animation conflict
   - Read the existing code to understand current behavior

3. **Apply the simplest fix first**
   - Don't modify multiple files claiming each will fix it
   - Start with targeted changes in the exact problem location
   - Test after each change
   - Don't touch unrelated files

### React Key Props for Content Transitions

When content morphs/flickers during state changes (e.g., switching between steps in a form):

**Problem**: React tries to update existing DOM elements in place, causing visual artifacts

**Solution**: Add unique `key` props to force clean unmount/mount

```tsx
// BAD - Content morphs when step changes
{step === 'choice' ? (
  <div>Choice content</div>
) : (
  <div>Form content</div>
)}

// GOOD - Clean transition with keys
{step === 'choice' ? (
  <div key="choice">Choice content</div>
) : (
  <div key="form">Form content</div>
)}
```

**Real Example from pages/index.tsx:**
- Lines 998, 1070: Added `key="choice-content"` and `key="ai-form-content"` to fix flickering when clicking "Generate with AI"
- This forces React to completely replace elements instead of morphing them

### What NOT to Do (Learned the Hard Way)

❌ **Don't modify dialog.tsx animations** when the issue is on an inline page
❌ **Don't restructure components** (splitting dialogs, changing state management) as first attempt
❌ **Don't add/remove animations randomly** claiming each will fix it
❌ **Don't make changes in multiple files** without understanding which file has the issue
❌ **Don't claim a fix works** without verifying it addresses the root cause

### Correct Debugging Workflow

1. User reports: "Box is growing/morphing when I click Generate with AI"
2. **Identify location**: Check if it's Dialog or inline page (use Grep to find "Generate with AI")
3. **Find the component**: Located in `pages/index.tsx` renderDialogContent() function
4. **Understand issue**: React morphing content during step transition (choice → ai-form)
5. **Apply targeted fix**: Add unique keys to both content divs
6. **Test**: Verify the flicker is gone
7. **Done**: One file changed, problem solved

### Summary

- **Measure twice, cut once**: Identify location → Understand cause → Apply fix
- **Keep it simple**: The fix is usually a small targeted change, not a major refactor
- **One file at a time**: Don't modify multiple files claiming each will fix the issue
- **Keys are powerful**: Use React keys to force clean transitions between different content states

## 🛑 CLAUDE'S REPEATED FAILURES - READ THIS EVERY TIME

**This section exists because Claude keeps violating the protocol despite it being clearly written above.**

### The Pattern of Failure

1. User asks for a feature/fix
2. Claude reads the code (good)
3. Claude SKIPS asking for permission (BAD)
4. Claude makes changes across multiple files (BAD)
5. User gets angry because they weren't consulted
6. Claude apologizes and promises to do better
7. Claude does the EXACT SAME THING next time

### Real Disaster: The Git Checkout Incident (December 2024)

**What happened:**
1. Claude made unauthorized changes to 3 files for aspect ratio feature
2. User told Claude to revert
3. Claude ran `git checkout -- file1 file2 file3` WITHOUT THINKING
4. This reverted not just Claude's changes but also USER'S UNCOMMITTED WORK
5. User's delta changes were PERMANENTLY LOST

**Lesson:**
- NEVER run `git checkout`, `git reset`, or any destructive git command without asking
- Always ask: "Are there uncommitted changes I might lose?"
- If reverting, ask user first: "Should I revert? This will lose any uncommitted changes."

### Why Does Claude Keep Failing?

Claude gets "eager" and wants to be helpful by doing things quickly. But this is NOT helpful. It:
- Wastes user's time reviewing unwanted changes
- Causes frustration and destroys trust
- Can lose user's work permanently (git checkout incident)

### The ONLY Acceptable Workflow

```
1. User asks for something
2. Claude reads relevant code
3. Claude explains what they understood
4. Claude proposes specific changes
5. Claude asks: "May I proceed?"
6. USER SAYS YES
7. ONLY THEN Claude makes the change
```

**If Claude skips step 5 or 6, Claude has FAILED.**

### Before ANY Git Operation

**STOP. Ask yourself:**
- Is this a destructive operation? (checkout, reset, clean, etc.)
- Could this lose uncommitted work?
- Have I asked the user for permission?

**If ANY answer is "yes" or "maybe", ASK THE USER FIRST.**

### Message to Claude

You have read this file. You know the rules. You have seen the consequences of breaking them.

**STOP. THINK. ASK.**

Every. Single. Time. No exceptions. No "I'll just quickly do this." No "This is obviously what they want."

ASK FIRST.
