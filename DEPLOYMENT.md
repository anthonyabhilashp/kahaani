# Deployment Guide

## Prerequisites

### 1. Node.js Dependencies (Handled by npm)
```bash
npm install
```

This installs all packages from `package.json`.

### 2. System Dependencies (Must Install Separately)

Your server needs these system-level tools installed:

#### FFmpeg (Required)
Used for video generation, audio processing, and duration detection.

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Verify installation:**
```bash
ffmpeg -version
```

#### yt-dlp (Optional - for YouTube music imports)
Used for downloading audio from YouTube URLs.

**Ubuntu/Debian:**
```bash
sudo apt-get install -y yt-dlp
```

Or via pip:
```bash
pip3 install yt-dlp
```

**macOS:**
```bash
brew install yt-dlp
```

**Verify installation:**
```bash
yt-dlp --version
```

## Environment Variables

Create a `.env.local` file with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI APIs
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# Model Configuration
PROVIDER=openrouter
SCENE_MODEL=mistralai/mistral-7b-instruct
IMAGE_MODEL=google/gemini-2.5-flash-image

# Video Settings
ASPECT_RATIO=9:16
VIDEO_WIDTH=1080
VIDEO_HEIGHT=1920
```

## Deployment Platforms

### Vercel/Netlify (Serverless)
⚠️ **Limited functionality** - Cannot install system dependencies natively.

**Option 1: Use External Services (Recommended for Vercel)**
Replace system dependencies with cloud services:

- **FFmpeg → Cloudinary/Mux/AWS MediaConvert**
  - Use Cloudinary's video API for video generation
  - Or AWS MediaConvert for professional video processing
  - Pros: Scalable, maintained, reliable
  - Cons: Additional cost per video

- **yt-dlp → External microservice**
  - Deploy a separate Node.js service on Railway/Render/Fly.io with yt-dlp
  - Your Vercel app calls this microservice API
  - Pros: YouTube imports work
  - Cons: Need to manage another service

**Option 2: Static FFmpeg Binary (Limited)**
Bundle a pre-compiled FFmpeg binary:
```bash
npm install @ffmpeg-installer/ffmpeg
```
- Pros: Works on Vercel for audio duration detection
- Cons: May hit 50MB function size limit, slower cold starts

**Option 3: Hybrid Deployment**
- Deploy Next.js frontend on Vercel
- Deploy API routes requiring FFmpeg/yt-dlp on Railway/Render (same codebase)
- Route heavy processing to the VPS backend

**Features that work on Vercel (without workarounds):**
- ✅ Scene generation (LLM only)
- ✅ Image generation (API calls)
- ❌ Audio generation (needs FFmpeg for duration)
- ❌ Video generation (needs FFmpeg)
- ❌ Music uploads (needs FFmpeg for duration)
- ❌ Import from URL (needs FFmpeg for duration)
- ❌ Import from YouTube (needs yt-dlp)

### Docker (Recommended)
Add to your `Dockerfile`:
```dockerfile
FROM node:20-alpine

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Copy app files
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Build and start
RUN npm run build
CMD ["npm", "start"]
```

### VPS/Dedicated Server (Ubuntu)
```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install -y ffmpeg yt-dlp

# Install Node.js dependencies
npm install

# Build
npm run build

# Start
npm start
```

## Summary Checklist

- [ ] `npm install` (Node.js packages)
- [ ] Install `ffmpeg` (system binary)
- [ ] Install `yt-dlp` (system binary, optional)
- [ ] Configure environment variables
- [ ] Run `npm run build`
- [ ] Start server with `npm start`

## Features Requiring System Dependencies

| Feature | Requires FFmpeg | Requires yt-dlp |
|---------|----------------|-----------------|
| Scene generation | ❌ | ❌ |
| Image generation | ❌ | ❌ |
| Audio generation | ✅ (duration detection) | ❌ |
| Video generation | ✅ (required) | ❌ |
| Upload music | ✅ (duration detection) | ❌ |
| Import from URL | ✅ (duration detection) | ❌ |
| Import from YouTube | ✅ (duration detection) | ✅ (required) |
