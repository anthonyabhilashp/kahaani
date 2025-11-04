import fs from 'fs';
import path from 'path';

/**
 * User-based logging with automatic log rotation
 *
 * Features:
 * - One log file per user (userId.log)
 * - Auto-rotation when file exceeds MAX_LOG_SIZE
 * - Keeps MAX_ROTATED_FILES old logs
 * - Thread-safe writes
 */

const LOGS_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 3 * 1024 * 1024; // 3MB in bytes
const MAX_ROTATED_FILES = 2; // Keep last 2 rotated logs (3 files total including current)

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

export class UserLogger {
  private userId: string;
  private logFilePath: string;

  constructor(userId: string) {
    this.userId = userId;
    this.logFilePath = path.join(LOGS_DIR, `${userId}.log`);
  }

  /**
   * Write a log entry with timestamp
   */
  log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
    try {
      // Check if rotation is needed before writing
      this.checkAndRotate();

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}\n`;

      // Append to log file
      fs.appendFileSync(this.logFilePath, logEntry, 'utf8');

      // ALSO log to console (so it appears in Railway dashboard)
      const consoleMessage = `[${level}] ${message}`;
      if (level === 'ERROR') {
        console.error(consoleMessage);
      } else if (level === 'WARN') {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
    } catch (error) {
      // Fallback to console if file write fails
      console.error(`Failed to write to log file for user ${this.userId}:`, error);
      console.log(message);
    }
  }

  /**
   * Log info level message
   */
  info(message: string): void {
    this.log(message, 'INFO');
  }

  /**
   * Log warning level message
   */
  warn(message: string): void {
    this.log(message, 'WARN');
  }

  /**
   * Log error level message
   */
  error(message: string): void {
    this.log(message, 'ERROR');
  }

  /**
   * Check file size and rotate if needed
   */
  private checkAndRotate(): void {
    try {
      // Check if log file exists and its size
      if (!fs.existsSync(this.logFilePath)) {
        return; // No file yet, nothing to rotate
      }

      const stats = fs.statSync(this.logFilePath);

      if (stats.size >= MAX_LOG_SIZE) {
        this.rotateLogFiles();
      }
    } catch (error) {
      console.error(`Error checking log file size for user ${this.userId}:`, error);
    }
  }

  /**
   * Rotate log files:
   * - userId_4.log -> userId_5.log (then delete _5)
   * - userId_3.log -> userId_4.log
   * - userId_2.log -> userId_3.log
   * - userId_1.log -> userId_2.log
   * - userId.log -> userId_1.log
   */
  private rotateLogFiles(): void {
    try {
      const baseDir = path.dirname(this.logFilePath);
      const baseName = path.basename(this.logFilePath, '.log'); // Extract userId

      // Delete oldest log file if it exists (userId_5.log)
      const oldestLog = path.join(baseDir, `${baseName}_${MAX_ROTATED_FILES}.log`);
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }

      // Rotate existing log files
      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const currentLog = path.join(baseDir, `${baseName}_${i}.log`);
        const nextLog = path.join(baseDir, `${baseName}_${i + 1}.log`);

        if (fs.existsSync(currentLog)) {
          fs.renameSync(currentLog, nextLog);
        }
      }

      // Rotate current log to _1
      const firstRotatedLog = path.join(baseDir, `${baseName}_1.log`);
      if (fs.existsSync(this.logFilePath)) {
        fs.renameSync(this.logFilePath, firstRotatedLog);
      }

      console.log(`✅ Rotated log files for user ${this.userId}`);
    } catch (error) {
      console.error(`Error rotating log files for user ${this.userId}:`, error);
    }
  }

  /**
   * Get log file path
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * Get all log files for this user (including rotated ones)
   */
  getAllLogFiles(): string[] {
    const logFiles: string[] = [];
    const baseDir = path.dirname(this.logFilePath);
    const baseName = path.basename(this.logFilePath, '.log');

    // Add current log if exists
    if (fs.existsSync(this.logFilePath)) {
      logFiles.push(this.logFilePath);
    }

    // Add rotated logs (userId_1.log, userId_2.log, etc.)
    for (let i = 1; i <= MAX_ROTATED_FILES; i++) {
      const rotatedLog = path.join(baseDir, `${baseName}_${i}.log`);
      if (fs.existsSync(rotatedLog)) {
        logFiles.push(rotatedLog);
      }
    }

    return logFiles;
  }

  /**
   * Read recent log entries (last N lines)
   */
  getRecentLogs(lines: number = 100): string[] {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return [];
      }

      const content = fs.readFileSync(this.logFilePath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());

      // Return last N lines
      return allLines.slice(-lines);
    } catch (error) {
      console.error(`Error reading log file for user ${this.userId}:`, error);
      return [];
    }
  }

  /**
   * Search logs for specific text
   */
  searchLogs(searchText: string, caseSensitive: boolean = false): string[] {
    try {
      const allLogFiles = this.getAllLogFiles();
      const results: string[] = [];

      for (const logFile of allLogFiles) {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
          const match = caseSensitive
            ? line.includes(searchText)
            : line.toLowerCase().includes(searchText.toLowerCase());

          if (match) {
            results.push(line);
          }
        }
      }

      return results;
    } catch (error) {
      console.error(`Error searching logs for user ${this.userId}:`, error);
      return [];
    }
  }

  /**
   * Delete all log files for this user
   */
  clearLogs(): void {
    try {
      const allLogFiles = this.getAllLogFiles();

      for (const logFile of allLogFiles) {
        fs.unlinkSync(logFile);
      }

      console.log(`🗑️  Deleted all log files for user ${this.userId}`);
    } catch (error) {
      console.error(`Error deleting log files for user ${this.userId}:`, error);
    }
  }
}

/**
 * Helper to get logger instance for a user
 */
export function getUserLogger(userId: string): UserLogger {
  return new UserLogger(userId);
}
