# User-Based Logging System

## Overview

The app uses a per-user logging system with automatic log rotation to track user activities and debug issues.

## Log File Structure

```
logs/
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b.log          # Current log
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_1.log        # 1st rotation (most recent)
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_2.log        # 2nd rotation
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_3.log        # 3rd rotation
├── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_4.log        # 4th rotation
└── 82bffe3e-9df5-4d4a-998c-6da5ac58c47b_5.log        # 5th rotation (oldest)
```

## Configuration

- **Max log file size**: 5MB
- **Max rotated files**: 5
- **Total storage per user**: ~30MB (6 files × 5MB)

## Usage in API Endpoints

```typescript
import { getUserLogger } from "@/lib/userLogger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get authenticated user
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);

  // Create logger for this user
  const logger = getUserLogger(user.id);

  // Log different levels
  logger.info(`User ${user.email} started generating story`);
  logger.warn(`Credit balance low: ${creditBalance}`);
  logger.error(`Failed to generate images: ${error.message}`);

  // ... rest of your code
}
```

## Log Entry Format

```
[2025-11-03T18:30:45.123Z] [INFO] User john@example.com started generating story
[2025-11-03T18:30:46.456Z] [INFO] LLM generated 5 scenes in 2.3s
[2025-11-03T18:30:50.789Z] [WARN] Image generation took 4.2s (slower than usual)
[2025-11-03T18:31:00.012Z] [ERROR] Failed to upload video: Network timeout
```

## Automatic Rotation

When a log file reaches 5MB:
1. `userid.log` → `userid_1.log`
2. `userid_1.log` → `userid_2.log`
3. `userid_2.log` → `userid_3.log`
4. `userid_3.log` → `userid_4.log`
5. `userid_4.log` → `userid_5.log`
6. `userid_5.log` → **deleted** (oldest log removed)

## Advanced Features

### Search Logs

```typescript
const logger = getUserLogger(userId);
const results = logger.searchLogs("error", false); // case-insensitive
console.log(results); // All lines containing "error"
```

### Get Recent Logs

```typescript
const logger = getUserLogger(userId);
const recent = logger.getRecentLogs(50); // Last 50 lines
```

### Get All Log Files

```typescript
const logger = getUserLogger(userId);
const allFiles = logger.getAllLogFiles();
// Returns: [
//   '/path/to/logs/userid.log',
//   '/path/to/logs/userid_1.log',
//   '/path/to/logs/userid_2.log',
//   ...
// ]
```

### Clear User Logs

```typescript
const logger = getUserLogger(userId);
logger.clearLogs(); // Deletes all log files for this user
```

## Best Practices

### 1. Log Important Events

✅ **Do log:**
- User actions (create story, generate images, etc.)
- API calls to external services
- Errors and warnings
- Performance metrics (generation time, file sizes)
- Credit transactions

❌ **Don't log:**
- Sensitive data (passwords, API keys)
- Full request/response bodies (too verbose)
- Personal information (beyond userId/email)

### 2. Use Appropriate Log Levels

- **INFO**: Normal operations, user actions
- **WARN**: Recoverable issues, slow performance
- **ERROR**: Failures, exceptions, unrecoverable errors

### 3. Include Context

```typescript
// Good
logger.info(`Generated 5 scenes for story ${storyId} in 2.3s`);

// Bad
logger.info(`Generated scenes`);
```

## Debugging Issues

### View User's Recent Activity

```bash
# On server
tail -100 /path/to/logs/82bffe3e-9df5-4d4a-998c-6da5ac58c47b.log
```

### Search for Errors

```bash
grep "ERROR" logs/82bffe3e-9df5-4d4a-998c-6da5ac58c47b*.log
```

### Monitor Live Logs

```bash
tail -f logs/82bffe3e-9df5-4d4a-998c-6da5ac58c47b.log
```

## Log Retention

- Logs are automatically rotated and old files deleted
- Maximum 6 files per user (~30MB)
- No manual cleanup needed

## Future Enhancements

- [ ] Log aggregation (send to centralized logging service)
- [ ] Real-time log streaming
- [ ] Log analytics dashboard
- [ ] Alerts on error patterns
- [ ] Compress old log files (.gz)

---

**That's it!** The logging system handles everything automatically. Just use `getUserLogger(userId)` in your API endpoints.
