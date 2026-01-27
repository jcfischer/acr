/**
 * ACR Logger
 *
 * JSONL logger with file rotation for query logging.
 * Part of F-008: Logging, Metrics & Debug Mode
 */

import * as fs from "fs";
import * as path from "path";
import {
  getLoggingConfig,
  expandPath,
  type LoggingConfig,
} from "./logging-config";

// ============================================================================
// Types
// ============================================================================

/**
 * Log entry for a single query
 */
export interface QueryLogEntry {
  /** ISO timestamp */
  ts: string;
  /** Original query string */
  query: string;
  /** Tier 1 results */
  tier1: {
    /** Number of grep matches */
    matches: number;
    /** Confidence score (0-1) */
    confidence: number;
    /** Time in milliseconds */
    ms: number;
  };
  /** Tier 2 results (null if not escalated) */
  tier2: {
    /** Number of semantic matches */
    matches: number;
    /** Top similarity score (0-1) */
    topSim: number;
    /** Time in milliseconds */
    ms: number;
  } | null;
  /** Total query time in milliseconds */
  totalMs: number;
}

// ============================================================================
// Logger Class
// ============================================================================

/**
 * JSONL logger with file rotation support
 */
export class Logger {
  private config: LoggingConfig;
  private logPath: string;

  /**
   * Create a new Logger instance
   * @param configPath - Optional custom config path (for testing)
   */
  constructor(configPath?: string) {
    this.config = getLoggingConfig(configPath);
    this.logPath = expandPath(this.config.logging.path);
  }

  /**
   * Log a query entry to the log file
   * @param entry - The query log entry to write
   */
  log(entry: QueryLogEntry): void {
    if (!this.config.logging.enabled) {
      return;
    }

    // Ensure parent directory exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Check if rotation is needed before writing
    this.rotateIfNeeded();

    // Append JSONL entry
    fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n");
  }

  /**
   * Get recent log entries
   * @param n - Number of entries to return (default 10)
   * @returns Array of recent entries, most recent first
   */
  getRecentEntries(n: number = 10): QueryLogEntry[] {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      // Take last n lines and reverse (most recent first)
      const recentLines = lines.slice(-n).reverse();

      return recentLines.map((line) => JSON.parse(line) as QueryLogEntry);
    } catch {
      return [];
    }
  }

  /**
   * Rotate log file if it exceeds maxSize
   */
  private rotateIfNeeded(): void {
    if (!fs.existsSync(this.logPath)) {
      return;
    }

    const stats = fs.statSync(this.logPath);
    if (stats.size < this.config.logging.maxSize) {
      return;
    }

    const maxFiles = this.config.logging.maxFiles;

    // Rotate existing files: .2 -> .3, .1 -> .2, main -> .1
    // Start from maxFiles and work backwards
    for (let i = maxFiles; i >= 1; i--) {
      const currentFile = i === 1 ? this.logPath : `${this.logPath}.${i - 1}`;
      const nextFile = `${this.logPath}.${i}`;

      if (fs.existsSync(currentFile)) {
        // If we're at maxFiles, the oldest file gets overwritten
        if (i === maxFiles && fs.existsSync(nextFile)) {
          fs.unlinkSync(nextFile);
        }
        fs.renameSync(currentFile, nextFile);
      }
    }

    // Main log file has been renamed to .1, so create fresh empty file
    // (will be created when next log() writes to it)
  }
}
