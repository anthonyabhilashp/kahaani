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

### FFmpeg Video Generation

- Uses `fluent-ffmpeg` to combine images and audio
- Each scene uses its audio duration for timing
- Falls back to 30s default if ffprobe fails
- Temporary files stored in `/tmp/{story_id}/` during processing
- Final video uploaded to Supabase Storage

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

1. Update `ASPECT_RATIO`, `VIDEO_WIDTH`, `VIDEO_HEIGHT` in `.env.local`
2. Both `generate_images.ts` and `generate_video.ts` use these values
3. Restart dev server for changes to take effect

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
