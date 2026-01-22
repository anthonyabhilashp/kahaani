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
OPENROUTER_API_KEY=        # Scene generation (stories) + UGC script generation
OPENAI_API_KEY=            # TTS audio generation
ELEVENLABS_API_KEY=        # Audio narration (alternative to OpenAI TTS)

# UGC Ads (New)
HEYGEN_API_KEY=            # Talking avatar video generation
UGC_SCRIPT_MODEL=google/gemini-2.5-flash-1219  # Optional: Override UGC script model (via OpenRouter)

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

---

## 💰 BUSINESS CONTEXT & REVENUE STRATEGY

**Last Updated:** January 2025

### Founder Situation

**Background:** 15+ years of strong technical skills
**Current Status:** Job at risk, uncertain future, need to escape 9-5 stress
**Goal:** Generate revenue from SaaS or agency to achieve financial independence
**Problem:** Technical expertise ✅ | Business/marketing skills ❌

### Current Product Status

**Product:** aivideogen.cc - AI-powered faceless video generation platform
**Metrics:** 50 sign-ups, 0 paying customers, 0% retention
**User Feedback:** Emailed 6 users, no replies
**Burn Rate:** $118/mo Claude + Supabase + Hosting + API costs
**Cash Runway:** Low - needs revenue within 30-60 days

### The Core Problem

**50 users tried the product. ZERO came back. ZERO paid.**

This is NOT a technical problem. This is a **customer acquisition + product-market fit** issue.

**Root causes:**
1. **Targeting wrong customers** - Faceless video creators have no budget, want free tools
2. **No differentiation** - "Just calling HeyGen APIs" - why use this vs HeyGen directly?
3. **Can't acquire customers** - Don't know how to do marketing/sales
4. **Founder doesn't use own product** - Red flag for product-market fit

**Critical Insight:** Technical skills ≠ Business success. Building features ≠ Revenue.

### Critical Lessons Learned

#### 1. **Too Many Features = Confusion**
- Product has 4 different features (Stories, Series, Cut Shorts, UGC)
- No clear value proposition
- Users don't know what problem it solves
- **Fix:** Focus on ONE use case that works perfectly

#### 2. **Multi-Step Process = Drop-off**
Current Faceless Video flow:
1. Generate Scenes (wait)
2. Generate Images (wait)
3. Generate Audio (wait)
4. Generate Video (wait)

**This is 4 separate clicks + waiting.** Users drop off.

**Fix:** Combine into ONE button that does everything automatically.

#### 3. **No Instant Gratification**
- New user signs up → Gets credits → Creates video → Waits 5-10 minutes → Gets mediocre result
- They don't see value in first 30 seconds
- **Fix:** Show example videos immediately, pre-generate first video, or 10-second demo

#### 4. **Credit System is Confusing**
- Users don't know how many credits they need
- Don't know what they can create with X credits
- Fear of running out mid-project
- **Fix:** Show upfront cost: "This video will cost 15 credits (you have 50)"

#### 5. **Quality Must Be Excellent**
- If output is mediocre, users won't pay
- Better to do ONE thing perfectly than many things poorly
- **Current stack:** Gemini Flash (images), ElevenLabs (audio), Pixabay (stock videos)

### NEW STRATEGIC PIVOT: UGC Ads for Performance Marketers

**After analysis, the BEST opportunity is UGC ads, NOT faceless videos.**

**Why UGC Ads > Faceless Videos:**
1. **Higher willingness to pay** - Agencies/brands spend $2k-10k/mo on ads
2. **Clear ROI** - Ad creatives directly impact revenue
3. **Proven market** - HeyGen already validates this
4. **Existing spend** - They're already paying for UGC creators ($100-300/video)

### Target Customer Analysis (UPDATED)

**Who will actually PAY for AI video generation:**

#### 🥇 #1: Performance Marketing Agencies (10/10 probability) ⭐ BEST TARGET

**Profile:**
- Running Facebook/TikTok/Instagram ads for e-commerce clients
- Need 10-50 UGC ad variations per client per month
- Currently hiring UGC creators on Fiverr ($50-150/video)
- Charge clients $5k-20k/mo for ad creative services

**Why they'll pay:**
- ✅ **MASSIVE SAVINGS** - Save $2k-5k/mo on creator fees
- ✅ **PROVEN BUYERS** - Already spending money on UGC content
- ✅ **Clear ROI** - Better ad creatives = more revenue for clients
- ✅ **Volume need** - Need constant fresh creatives for A/B testing
- ✅ **Time savings** - Generate 50 ads in 1 hour vs 15 hours manual

**Pricing they'll accept:**
- $299-500/mo for unlimited UGC ads
- **Math:** Saves $2k-5k/mo in creator fees, paying $299 is easy ROI

**Where to find them:**
- Facebook Groups: "Facebook Media Buyers", "Ecom Ads", "Performance Marketing"
- Twitter: Search "looking for UGC creators" or "hiring UGC"
- LinkedIn: Media buyers, growth marketers at e-commerce brands
- Reddit: r/PPC, r/marketing

**How to reach them:**
- Direct outreach: "Save $3k/mo on UGC creators - generate unlimited ads with AI"
- Case study: "We created 50 UGC ads in 2 hours for $100 vs $5,000 on Fiverr"

#### 🥈 #2: E-commerce Brands (Shopify $50k+/mo revenue) (9/10 probability)

**Profile:**
- Testing Facebook/TikTok ads constantly
- Need fresh UGC creatives every week
- Paying $100-300 per UGC video on Fiverr/creators
- Already spending $5k-50k/mo on ads

**Why they'll pay:**
- ✅ Testing more creatives = higher ROAS
- ✅ Faster iteration = competitive advantage
- ✅ Lower cost per creative = more tests within budget

**Pricing:** $300-1000/mo

#### 🥉 #3: SaaS Marketing Teams (7/10 probability)

**Profile:**
- Need product demos, testimonials, explainer videos
- Currently hiring videographers or using Loom (low quality)
- Want professional AI avatars for onboarding, docs, demos

**Pricing:** $500-2000/mo (enterprise budget)

#### 🥉 #3: Podcast Clip Creators (7/10 probability)

**Profile:**
- Turn podcast episodes into 20+ short clips
- Takes 10 hours manually
- Need automation

**Pricing:** $49-99/mo

### DIFFERENTIATION STRATEGY: Why Use This vs HeyGen?

**The Question:** "HeyGen already does UGC ads. Why would anyone use this tool?"

**The Answer:** We're NOT competing on avatar technology. We're competing on **WORKFLOW AUTOMATION**.

#### HeyGen = Infrastructure (Like AWS)
#### This Tool = Workflow Layer (Like Vercel)

**HeyGen workflow** (Manual, 45min per ad):
1. Write script manually (10 min)
2. Choose avatar manually (2 min)
3. Choose voice manually (2 min)
4. Find stock footage manually (10 min)
5. Upload product image (3 min)
6. Generate video (5 min)
7. Download and edit (10 min)
8. **Repeat 20x = 15 hours for 20 ads**

**Our Tool workflow** (Automated, 2min per ad):
1. Paste product URL
2. Click "Generate 10 UGC ad variations"
3. AI automatically:
   - Generates 10 different scripts (OpenRouter)
   - Selects best avatars for niche
   - Pulls relevant stock footage (Pixabay)
   - Calls HeyGen API 10 times
4. Get 10 ready-to-download ads
5. **Total time: 20 minutes for 10 ads**

**We use HeyGen API in the backend. Differentiation is in AUTOMATION and SPEED.**

#### Key Features That Beat HeyGen:

1. **Product URL → Instant Ads**
   - Scrape product info from URL
   - Auto-generate 10 script variations
   - Auto-select avatars/voices/footage
   - Batch process through HeyGen API
   - **10x faster than manual**

2. **UGC Ad Templates**
   - Pre-built formats: Problem-Solve, Testimonial, Unboxing, Demo
   - One-click to apply to any product
   - HeyGen doesn't have templates

3. **Bulk Generation**
   - Upload CSV with 10 products → Get 100 ads
   - HeyGen = one at a time manually

4. **Performance Tracking** (Future)
   - Connect to Facebook Ads
   - See which avatars/scripts convert best
   - Auto-generate more of what works

**Pricing:**
- HeyGen: $89-180/mo (DIY, slow workflow)
- Us: $299/mo (automated, fast, saves 10-15 hours/week)

**Value Prop:** "You're not paying for avatar videos. You're paying to save 10-15 hours per week."

An agency billing at $100/hr saves $1,500/mo in time. Paying us $299/mo is a no-brainer ROI.

### Recommended Revenue Strategy

**CRITICAL:** Customer acquisition is the #1 problem, not product features.

**Two Paths to Revenue:**

#### Path 1: Agency/Service Model (RECOMMENDED - Faster Cash)

**Why Service First:**
- ✅ Cash flow in 1-2 weeks vs 6-12 months for SaaS
- ✅ Learn what customers actually want
- ✅ Build case studies and testimonials
- ✅ Lower risk - get paid BEFORE building
- ✅ Forces you to learn sales/marketing
- ✅ Validates demand before scaling

**How It Works:**
1. Offer "Done-For-You UGC Ad Creation Service"
2. Charge $2k-5k per project (20-50 ads)
3. Use your tool to deliver fast (2-4 hours instead of 15+)
4. Pocket the difference

**Timeline:**
- Week 1-2: Outreach to 50 agencies/brands, get first client
- Month 1: $5k-10k revenue from 2-3 clients
- Month 2: $10k-15k revenue, refine offering
- Month 3: Convert to SaaS ($299/mo unlimited) or keep scaling service

#### Path 2: SaaS Model (Slower, Higher Risk)

**Timeline: 6-12 months to $3k-5k MRR**

**Requirements:**
- ✅ Build automation features (Product URL → Ads)
- ❌ Get good at marketing/sales (you haven't proven this yet)
- ❌ Create content (SEO, Twitter, YouTube)
- ❌ Build distribution channels
- **Success rate: 10-20% of indie SaaS makers**

**Risk:** Spend 6 months building, still can't acquire customers profitably, $0 revenue

#### RECOMMENDED: Hybrid Approach

**Month 1-2: Agency Model**
- Manual outreach to 50 prospects
- Get 2-3 clients at $2k-5k each
- Use tool to deliver fast
- **Revenue: $6k-15k**
- **Learn:** What do they actually need?

**Month 3: Build Based on Real Feedback**
- Identify patterns in what clients ask for
- Build "Product URL → Ads" automation
- Build template library
- **Revenue: Continue agency work ($5k-10k/mo)**

**Month 4+: Transition to SaaS**
- Offer existing clients: "$3k per project OR $299/mo unlimited"
- Convert 30-50% to monthly subscriptions
- **First $600-1500 MRR with REAL validated customers**

### Revenue Projections (Realistic)

#### Agency Model (Months 1-3):
- 2-3 clients/month @ $3k average = **$6k-9k/mo**
- Costs: ~$500/mo (HeyGen API + hosting)
- **Net profit: $5.5k-8.5k/mo**

#### Hybrid Model (Months 4-6):
- 5 SaaS customers @ $299/mo = $1,495 MRR
- 1-2 agency clients @ $3k = $3k-6k
- **Total: $4.5k-7.5k/mo**

#### SaaS Model (Months 6-12):
- 15-30 customers @ $299/mo = **$4.5k-9k MRR**
- Costs: ~$2k/mo
- **Net: $2.5k-7k/mo profit**

**Worst Case SaaS:** 0-5 customers = $0-1.5k MRR (not sustainable)

### Customer Acquisition Strategy

**The REAL problem: You can't acquire customers yet.**

50 users tried product, 0 paid, 6 ignored emails = **customer acquisition problem**.

**What Works:**

1. **Direct Outreach** (Week 1-4)
   - Find 50 agencies on LinkedIn/Twitter doing UGC ads
   - Message: "I noticed you create UGC ads for [brand]. I can generate 20 ad variations in 2 hours for $2k instead of $5k on Fiverr. Interested?"
   - Goal: Get 1 YES

2. **Community Engagement** (Ongoing)
   - Join Facebook groups for media buyers
   - Answer questions, provide value
   - Share case study: "How I created 50 ads in 2 hours"
   - Build trust before selling

3. **Content Marketing** (Month 2+)
   - Twitter threads: "How to create 50 UGC ads without hiring creators"
   - YouTube: Tutorial on bulk ad generation
   - Blog: "UGC Ad Templates That Convert"
   - **Goal: Inbound leads**

4. **Partnerships** (Month 3+)
   - White-label for agencies
   - They pay $200/mo, charge clients $500/mo
   - Revenue share model

**What Doesn't Work (Yet):**
- ❌ Paid ads (0% conversion = burning money)
- ❌ Cold email to strangers (gets ignored)
- ❌ Posting on social without audience
- ❌ Building features hoping people will come

**STOP building features. START validating demand.**

#### Week 1: User Research & Proof
1. Email 50 existing users - offer $10 Starbucks for 15min call
2. Find out WHY they didn't come back
3. Create 5 sample videos - be brutally honest about quality
4. Identify 50 YouTube faceless channels (10K-500K subs)

#### Week 2: Service-Based Revenue (Fastest path to cash)
1. Create 3 sample videos in popular faceless channel styles
2. Email 50 creators: "I made this sample for you - interested?"
3. Offer: "Done-for-you faceless videos - $299 each, 24hr delivery"
4. **Goal:** Get 1 paying client

**Why service first:**
- Cash flow NOW (desperately needed)
- Learn what customers actually want
- Build case studies
- Discover which feature is valuable

#### Week 3-4: Scale What Works
If service gets traction:
- Do 5-10 client projects manually
- Document what works
- Build templates
- Then automate with SaaS

If NO ONE buys service after 20 outreach attempts:
- Product might not be viable
- Consider pivot or shutdown

### What NOT to Do

❌ **Don't run paid ads** - 0% conversion = burning money
❌ **Don't build more features** - Won't fix retention
❌ **Don't assume you know the problem** - Talk to users first
❌ **Don't ignore the data** - 50 users, 0 retention = broken

### Cost Cutting Measures

**Immediate actions to reduce burn:**
1. Pause Claude subscription after critical work ($118/mo saved)
2. Use Supabase free tier if possible
3. Switch to cheapest AI models (not GPT-4)
4. Minimize hosting costs

**Can't outrun burn rate with zero revenue.**

### Success Metrics

**30-Day Goal:**
- 1 paying customer (service or SaaS)
- $99-299 revenue
- Validated that someone will pay

**90-Day Goal:**
- 10 paying customers
- $500-1,000 MRR
- Clear product-market fit signal

### Alternative Revenue Models

If faceless videos don't work:

1. **UGC Ads Service** - Create UGC-style ads for DTC brands ($299-500/video)
2. **White-label** - Partner with agencies who resell to clients
3. **Niche SaaS** - Pick ONE vertical (e.g., "TikTok hooks for SaaS")
4. **Consulting** - Position as video creation consultant, use tool to deliver faster

### Hard Truth

**If after talking to 10 users you discover:**
- Videos are low quality
- Process is too complicated
- Competitors are better
- Nobody needs this

**Then pivot or shut down.** Better to find out now than after burning $1,000 more.

### Key Principles

**1. Revenue solves everything. Features don't.**

Focus 100% of energy on getting ONE person to pay. Once you have that, you have a business. Until then, you have a hobby.

**2. Technical skills ≠ Business success**

You can code anything. But can you:
- Identify a painful problem people pay to solve?
- Talk to customers and understand their needs?
- Market and sell the solution?
- Acquire customers profitably?

These are DIFFERENT skills. And that's okay - you can learn them or partner with someone who has them.

**3. Service Before SaaS**

If you can't get 10 people to pay for a service, you won't get them to pay for SaaS.

Service model:
- ✅ Validates demand
- ✅ Generates cash NOW
- ✅ Forces you to learn sales
- ✅ Lower risk

**4. "Just Calling APIs" Can Work**

Successful "wrapper" businesses:
- Jasper AI: $125M revenue wrapping OpenAI
- Descript: Wrapping speech-to-text APIs
- ChatGPT wrappers: Making $10k-50k/mo

The wrapper isn't the problem. **Workflow automation + niche positioning = differentiation.**

**5. Customer Acquisition > Product Features**

50 users, 0 paid = Customer acquisition problem, NOT product problem.

Best product in the world fails without customers.
Mediocre product thrives with great distribution.

**6. Build What Customers Want, Not What You Think They Want**

"I don't even use my own product" = Red flag

Either:
- Build something YOU desperately need, OR
- Talk to 50 customers and build what THEY desperately need

Don't build in a vacuum.

### IMMEDIATE NEXT STEPS (Updated Jan 2025)

**This Week:**

1. **Stop building features** - The product is good enough
2. **Choose path:** Agency (recommended) or SaaS
3. **If Agency:** Write outreach message, find 50 prospects, send 10 messages/day
4. **If SaaS:** Build "Product URL → Ads" automation feature first
5. **Set goal:** Get 1 person to pay $100+ by end of week

**This Month:**

1. **Get first paying customer** (service or SaaS)
2. **Deliver exceptional results** - Overdeliver to get testimonial
3. **Document what worked** - What did they really need?
4. **Iterate based on feedback** - Build/refine based on real usage
5. **Goal:** $1k-3k revenue, validated demand

**Next 3 Months:**

1. **Agency route:** Scale to 5-10 clients, $15k-30k/mo revenue
2. **SaaS route:** Get 5-15 customers, $1.5k-4.5k MRR
3. **Hybrid route:** 3-5 agency clients + 5-10 SaaS customers = $10k-20k/mo
4. **Goal:** Replace job income, quit 9-5

### Warning Signs to Pivot or Quit

**If after 30 days:**
- 0 people willing to pay for service
- 50+ outreach attempts, all ignored
- Can't explain value prop in 1 sentence
- Still building features instead of talking to customers

**Then:** Product might not be viable. Consider pivot or shutdown.

**Better to fail fast and try something else than slowly burn cash hoping it works.**

---

## 🎯 IMMEDIATE ACTION ITEMS (When Working on This Codebase)

Based on business context above, **prioritize:**

1. ✅ **Simplification over features** - Remove complexity, don't add it
2. ✅ **User research insights** - Implement feedback from user interviews
3. ✅ **Quality over quantity** - Make ONE feature excellent, not many mediocre
4. ✅ **Speed to value** - Reduce time from signup to first video
5. ❌ **No new features** unless user explicitly validated demand

**Before building anything, ask:**
- "Will this help get the first paying customer?"
- "Did a user explicitly ask for this?"
- "Does this simplify or complicate the experience?"

If answer is no, don't build it.
