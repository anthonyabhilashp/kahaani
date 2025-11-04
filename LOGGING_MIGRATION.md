# Migrating to UserLogger

## Summary

We're replacing `JobLogger` (per-story logs) with `UserLogger` (per-user logs) for better debugging and support.

## Benefits

- ✅ All user activity in one place
- ✅ Automatic log rotation (no manual cleanup)
- ✅ Easy to find user's complete history
- ✅ Better for support & debugging
- ✅ Multiple stories tracked in one log file

---

## Migration Pattern

### Before (JobLogger):
```typescript
import { JobLogger } from "../../lib/logger";

export default async function handler(req, res) {
  const { story_id } = req.body;
  let logger: JobLogger | null = null;

  try {
    const { user } = await auth.getUser(token);

    logger = new JobLogger(story_id, "context");
    logger.log(`User: ${user.email}`);
    logger.log(`Processing story ${story_id}`);

    // ... do work ...

    logger.log(`✅ Success`);
    res.status(200).json({ success: true });
  } catch (err) {
    if (logger) logger.error("Failed", err);
    res.status(500).json({ error: err.message });
  }
}
```

### After (UserLogger):
```typescript
import { getUserLogger } from "../../lib/userLogger";

export default async function handler(req, res) {
  const { story_id } = req.body;

  try {
    const { user } = await auth.getUser(token);

    const logger = getUserLogger(user.id);
    logger.info(`[${story_id}] Starting scene generation`);
    logger.info(`[${story_id}] User: ${user.email}`);

    // ... do work ...

    logger.info(`[${story_id}] ✅ Success`);
    res.status(200).json({ success: true });
  } catch (err) {
    // Logger always defined here (after auth)
    logger.error(`[${story_id}] ❌ Failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
```

---

## Key Changes

### 1. Import
```diff
- import { JobLogger } from "../../lib/logger";
+ import { getUserLogger } from "../../lib/userLogger";
```

### 2. Logger Initialization
```diff
- let logger: JobLogger | null = null;
- logger = new JobLogger(story_id, "context");
+ const logger = getUserLogger(user.id);
```

### 3. Log Methods
```diff
- logger.log(`Message`);
+ logger.info(`Message`);  // or .warn() or .error()
```

### 4. Include Story Context
```diff
- logger.log(`Processing story`);
+ logger.info(`[${story_id}] Processing story`);
```

### 5. Error Handling
```diff
- if (logger) logger.error("Failed", err);
+ logger.error(`Failed: ${err.message}`);  // No null check needed
```

---

## Endpoints to Update

- [x] `/api/generate_scenes` ← Example updated
- [ ] `/api/generate_images`
- [ ] `/api/generate_audio`
- [ ] `/api/generate_video`
- [ ] `/api/edit_scene`
- [ ] `/api/delete_scene`
- [ ] `/api/delete_story`

---

## Log File Example

**Before** (one file per story):
```
logs/
├── log_story-123_generate_scenes.txt
├── log_story-123_generate_images.txt
├── log_story-123_generate_video.txt
├── log_story-456_generate_scenes.txt
└── log_story-456_generate_images.txt
```

**After** (one file per user):
```
logs/
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b.log     <-- Current log (all activity for this user)
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_1.log   <-- 1st rotation
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_2.log   <-- 2nd rotation (oldest)
└── a1b2c3d4-...uuid....log                      <-- Another user
```

**Sample log content:**
```
[2025-11-03T19:00:00.000Z] [INFO] [story-123] Starting scene generation
[2025-11-03T19:00:01.234Z] [INFO] [story-123] User: john@example.com
[2025-11-03T19:00:05.678Z] [INFO] [story-123] ✅ Generated 5 scenes
[2025-11-03T19:02:00.000Z] [INFO] [story-123] Starting image generation
[2025-11-03T19:02:30.456Z] [INFO] [story-123] ✅ Generated 5 images
[2025-11-03T19:05:00.000Z] [INFO] [story-456] Starting scene generation
[2025-11-03T19:05:02.789Z] [WARN] [story-456] Credit balance low: 15
```

---

## Testing

```bash
# Generate a story as user
# Check log file was created
ls logs/

# Should see: 82bffe3e-9df5-4d4a-998c-6da5ac58c47b.log

# View logs
cat logs/82bffe3e-9df5-4d4a-998c-6da5ac58c47b.log

# Generate more content to exceed 3MB and test rotation
# Should see: userid_1.log appear
```

---

## Do you want me to:

1. **Update all API endpoints** (~10 endpoints) to use UserLogger
2. **Just keep the example** and you'll update them as needed
3. **Update specific endpoints** (which ones?)

Let me know!
