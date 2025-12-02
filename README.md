# Kahaani - Story Generation Platform

## Generation Flow

The application follows a user-controlled, cost-conscious generation flow:

### 1. Story Creation
- User provides a prompt
- AI generates story scenes
- Scenes are reviewed by user

### 2. Visual Generation (Manual - Cost Aware)
**Step 1: Generate Images**
- User clicks "1. Generate Images" when satisfied with scenes
- AI creates visual representations for each scene
- Uses AI credits - only triggered by user

**Step 2: Generate Audio** 
- Enabled only after images are generated
- Creates audio narration for the story
- User clicks "2. Generate Audio"

**Step 3: Generate Video**
- Enabled only after audio is generated  
- Combines images and audio into final video
- User clicks "3. Generate Video"

### Benefits of This Flow:
- **Cost Control**: No automatic generation - user decides when to spend credits
- **Quality Check**: User can review scenes before committing to expensive operations
- **Progressive Enhancement**: Each step builds on the previous one
- **Clear UX**: Visual indicators show what's ready and what's next

## Latest Fixes (v1.5) - Perfect 3-Panel Layout

### ✅ **Professional 3-Panel Layout:**
- **Left Sidebar**: Scenes browser with thumbnails
- **Center**: Clean video/image preview (no overlapping!)
- **Right Sidebar**: Organized controls and options

### ✅ **Right Sidebar Sections:**
1. **⚡ Generation**
   - 3 full-width buttons: Images, Audio, Video
   - Clear states: Blue (ready), Green (done), Gray (disabled)
   - No more overlapping on video!

2. **🔊 Audio**
   - Audio player when ready
   - Status indicator
   - Clean, contained section

3. **CC Captions** (Coming Soon)
   - Future caption generation
   - Prepared for expansion

4. **🎨 Background** (Coming Soon)
   - Future background customization
   - Room for growth

### ✅ **Perfect Solution:**
- **No More Overlapping**: Buttons are safely in sidebar
- **Organized**: Each feature has its own dedicated section
- **Scalable**: Easy to add new features in future
- **Clean Preview**: Center area is purely for viewing content
- **Professional**: Looks like a real video editing tool

### ✅ **Previous Fixes (v1.1):**
- **Button State Issues Fixed**: Proper error handling, success feedback, debug logging
- **Video Aspect Ratio Fixed**: Natural aspect ratio display for any video format
- **Image Display Improvements**: Better aspect ratio preservation and sizing

## Technical Implementation

### Fixed Issues:
- ✅ Removed non-functional "Regenerate" button
- ✅ Fixed 404 errors for missing placeholder.png and grid.svg
- ✅ Added proper image placeholders with icons
- ✅ Cleaned up Next.js config (removed experimental features)
- ✅ Implemented progressive generation flow
- ✅ **NEW**: Fixed button state updates after generation
- ✅ **NEW**: Fixed video aspect ratio display issues
- ✅ **NEW**: Added proper error handling and user feedback

### Key Features:
- Smart placeholder components for missing images
- Step-by-step generation with visual progress indicators
- Disabled states to prevent out-of-order generation
- Cost-conscious design with manual triggers only
- **NEW**: Responsive video player that handles any aspect ratio
- **NEW**: Real-time button state updates with success indicators
- **NEW**: Better error reporting and debugging

## Testing Instructions

1. **Install Node.js** (if not already installed)
2. **Install dependencies**: `npm install`
3. **Run development server**: `npm run dev` or `npm run debug`
4. **Test the generation flow**:
   - Create a story
   - Check that buttons show proper states
   - Generate images → button should show "✓ X Images Ready"
   - Generate audio → button should show "✓ Audio Ready"  
   - Generate video → should display with proper aspect ratio

## Debugging

- Open browser console to see generation logs
- Check video dimensions in console when video loads
- Button states are logged when they change
- Generation errors are displayed as alerts

## Docker Deployment

### Production Deployment to VPS (Hostinger/Hetzner)

**⚠️ IMPORTANT: Platform Architecture**

Most VPS servers (including Hostinger) use AMD64 architecture, but Mac M1/M2/M3 uses ARM64. You MUST specify the platform when building Docker images to ensure compatibility.

#### Quick Deploy Script

Use the provided deployment script for easy deployment:

```bash
./deploy.sh
```

This script automatically:
1. Builds Docker image for AMD64 platform
2. Pushes to Docker Hub (anthonyabhilash/kahaani:latest)
3. Displays deployment instructions for VPS

#### Manual Deployment Steps

**1. Build for AMD64 Platform (Critical!)**
```bash
# ALWAYS use --platform linux/amd64 flag for VPS deployment
docker build --platform linux/amd64 -t anthonyabhilash/kahaani:latest .
```

**2. Push to Docker Hub**
```bash
docker push anthonyabhilash/kahaani:latest
```

**3. Deploy on VPS (Hostinger/Hetzner)**

SSH into your server and run:

```bash
# Pull latest image
docker pull anthonyabhilash/kahaani:latest

# Stop and remove old container (if exists)
docker stop kahaani && docker rm kahaani

# Run new container
docker run -d \
  --name kahaani \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  anthonyabhilash/kahaani:latest

# Check logs
docker logs -f kahaani
```

**4. Environment Variables**

Create a `.env` file on your VPS with all variables from `.env.local`:

```bash
# Copy all environment variables from your local .env.local
# Including:
# - Supabase credentials
# - API keys (OpenRouter, OpenAI, ElevenLabs, etc.)
# - Model configurations
# - Video dimensions
```

#### Troubleshooting

**Container exits with "exec format error":**
- **Cause**: Image was built for wrong architecture (ARM64 instead of AMD64)
- **Fix**: Rebuild with `--platform linux/amd64` flag

**Container restarts continuously:**
```bash
# Check logs for errors
docker logs kahaani

# Verify environment variables
docker exec kahaani env | grep SUPABASE
```

**Port conflicts:**
```bash
# Check what's using port 3000
lsof -i :3000

# Use different port
docker run -d --name kahaani -p 8080:3000 --env-file .env anthonyabhilash/kahaani:latest
```

#### Files Created for Deployment

- `Dockerfile` - Multi-stage Docker build configuration
- `.dockerignore` - Excludes unnecessary files from build
- `deploy.sh` - Automated deployment script