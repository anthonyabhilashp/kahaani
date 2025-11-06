# Image Generation Jobs System - Setup Instructions

## Overview
This document describes the new image generation job system that prevents multiple concurrent image generations for the same story.

## What Was Implemented

### 1. Backend API Endpoints

#### `/pages/api/clear_image_job.ts`
- Clears stuck image generation jobs
- Similar to the video job clearing system
- Marks processing jobs as failed with appropriate error messages

#### Modified `/pages/api/generate_images.ts`
- Checks for existing image generation jobs before starting
- Creates a job record when generation starts
- Marks job as completed or failed when done
- Auto-clears stale jobs (older than 5 minutes)
- Returns 409 error if a job is already in progress

### 2. Database Migration

Created `/migrations/create_image_generation_jobs_table.sql`

**To apply this migration:**

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the contents of `migrations/create_image_generation_jobs_table.sql`
5. Click "Run" to execute the migration

The migration creates:
- `image_generation_jobs` table with columns:
  - `id` (UUID, primary key)
  - `story_id` (UUID, foreign key to stories)
  - `status` (VARCHAR: 'processing', 'completed', 'failed')
  - `progress` (INTEGER: 0-100, for future use)
  - `error` (TEXT: error message if failed)
  - `started_at` (TIMESTAMPTZ: when job started)
  - `completed_at` (TIMESTAMPTZ: when job finished)
  - `created_at` (TIMESTAMPTZ: record creation time)
- Indexes for faster lookups
- Row Level Security (RLS) policies

## How It Works

### Job Lifecycle

1. **User clicks "Generate Images"**
   - System checks if a job is already processing for this story
   - If yes and job is recent (< 5 minutes): Returns 409 error
   - If yes and job is stale (> 5 minutes): Auto-clears and proceeds
   - If no: Creates new job with status='processing'

2. **During Image Generation**
   - Job record exists with status='processing'
   - Any subsequent "Generate Images" attempts will be blocked

3. **On Completion**
   - Success: Job marked as 'completed'
   - Failure: Job marked as 'failed' with error message

4. **User Can Clear Stuck Jobs**
   - Call `/api/clear_image_job` with story_id
   - Job status changed to 'failed' with cleanup message

## Frontend Integration (TODO)

The frontend needs to be updated to handle the 409 error response:

```typescript
// In the generateImages function, handle 409 error:
try {
  const response = await fetch('/api/generate_images', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ story_id, style, instructions })
  });

  if (response.status === 409) {
    // Show dialog: "Image generation already in progress. Clear stuck job?"
    // On confirm, call /api/clear_image_job
    // Then retry generateImages
  }

  // ... rest of the code
} catch (error) {
  // Handle error
}
```

## Benefits

1. **Prevents Concurrent Jobs**: Only one image generation per story at a time
2. **Auto-Recovery**: Stale jobs (>5 minutes) are automatically cleared
3. **User Control**: Users can manually clear stuck jobs
4. **Consistent with Video System**: Same pattern as video generation jobs
5. **Better Resource Management**: Prevents server overload from duplicate requests

## Testing

After running the migration, test the system:

1. Start generating images for a story
2. Try to generate images again immediately (should get 409 error)
3. Wait 5 minutes and try again (should auto-clear and proceed)
4. Or use the clear job button to manually clear (once frontend is updated)

## Files Created/Modified

- ✅ `/pages/api/clear_image_job.ts` (new)
- ✅ `/pages/api/generate_images.ts` (modified)
- ✅ `/migrations/create_image_generation_jobs_table.sql` (new)
- ⏳ Frontend changes needed (video editor page)
