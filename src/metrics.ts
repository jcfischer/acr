/**
 * ACR Metrics
 *
 * SQLite-based metrics storage with retention and aggregation.
 * Part of F-008: Logging, Metrics & Debug Mode
 */

import { Database } from "bun:sqlite";
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
 * Metrics for a single query
 */
export interface QueryMetrics {
  /** SHA256 hash of query (for privacy) */
  queryHash: string;
  /** Length of original query */
  queryLength: number;
  /** Number of Tier 1 grep matches */
  tier1Matches: number;
  /** Tier 1 confidence score (0-1) */
  tier1Confidence: number;
  /** Tier 1 time in milliseconds */
  tier1Ms: number;
  /** Whether query escalated to Tier 2 */
  tier2Escalated: boolean;
  /** Number of Tier 2 semantic matches (optional) */
  tier2Matches?: number;
  /** Top Tier 2 similarity score (optional) */
  tier2TopSimilarity?: number;
  /** Tier 2 time in milliseconds (optional) */
  tier2Ms?: number;
  /** Total query time in milliseconds */
  totalMs: number;
}

/**
 * Aggregated metrics summary
 */
export interface MetricsSummary {
  /** Total number of queries */
  totalQueries: number;
  /** Average total query time */
  avgTotalMs: number;
  /** Rate of Tier 2 escalation (0-1) */
  tier2EscalationRate: number;
  /** Tier 1 aggregated metrics */
  tier1: {
    /** Average number of matches */
    avgMatches: number;
    /** Average confidence score */
    avgConfidence: number;
    /** Average time in milliseconds */
    avgMs: number;
  };
  /** Tier 2 aggregated metrics */
  tier2: {
    /** Average number of matches */
    avgMatches: number;
    /** Average similarity score */
    avgSimilarity: number;
    /** Average time in milliseconds */
    avgMs: number;
  };
}

// ============================================================================
// MetricsStore Class
// ============================================================================

/**
 * SQLite-based metrics storage
 */
export class MetricsStore {
  private db: Database;
  private config: LoggingConfig;
  private dbPath: string;

  /**
   * Create a new MetricsStore instance
   * @param configPath - Optional custom config path (for testing)
   */
  constructor(configPath?: string) {
    this.config = getLoggingConfig(configPath);
    this.dbPath = expandPath(this.config.metrics.path);

    // Ensure parent directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);
    this.migrate();
  }

  /**
   * Create database tables if they don't exist
   */
  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS queries (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        query_hash TEXT NOT NULL,
        query_length INTEGER NOT NULL,
        tier1_matches INTEGER,
        tier1_confidence REAL,
        tier1_ms INTEGER,
        tier2_escalated INTEGER DEFAULT 0,
        tier2_matches INTEGER,
        tier2_top_similarity REAL,
        tier2_ms INTEGER,
        total_ms INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON queries(timestamp)`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_queries_hash ON queries(query_hash)`
    );
  }

  /**
   * Record a query's metrics
   * @param metrics - The query metrics to record
   */
  record(metrics: QueryMetrics): void {
    if (!this.config.metrics.enabled) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO queries (
        timestamp, query_hash, query_length,
        tier1_matches, tier1_confidence, tier1_ms,
        tier2_escalated, tier2_matches, tier2_top_similarity, tier2_ms,
        total_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      Date.now(),
      metrics.queryHash,
      metrics.queryLength,
      metrics.tier1Matches,
      metrics.tier1Confidence,
      metrics.tier1Ms,
      metrics.tier2Escalated ? 1 : 0,
      metrics.tier2Matches ?? null,
      metrics.tier2TopSimilarity ?? null,
      metrics.tier2Ms ?? null,
      metrics.totalMs
    );

    // Cleanup old records periodically
    this.cleanup();
  }

  /**
   * Remove records older than retention period
   */
  cleanup(): void {
    const retentionMs =
      this.config.metrics.retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;

    this.db.run(`DELETE FROM queries WHERE timestamp < ?`, [cutoff]);
  }

  /**
   * Get aggregated metrics summary
   * @param days - Number of days to include (default 7)
   * @returns Aggregated metrics summary
   */
  getSummary(days: number = 7): MetricsSummary {
    const cutoffMs = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - cutoffMs;

    const row = this.db
      .query(
        `
      SELECT
        COUNT(*) as total_queries,
        AVG(total_ms) as avg_total_ms,
        AVG(tier1_matches) as avg_tier1_matches,
        AVG(tier1_confidence) as avg_tier1_conf,
        AVG(tier1_ms) as avg_tier1_ms,
        AVG(tier2_escalated) as tier2_rate,
        AVG(CASE WHEN tier2_escalated = 1 THEN tier2_matches END) as avg_tier2_matches,
        AVG(CASE WHEN tier2_escalated = 1 THEN tier2_top_similarity END) as avg_tier2_sim,
        AVG(CASE WHEN tier2_escalated = 1 THEN tier2_ms END) as avg_tier2_ms
      FROM queries
      WHERE timestamp > ?
    `
      )
      .get(cutoff) as Record<string, number | null>;

    return {
      totalQueries: row.total_queries || 0,
      avgTotalMs: row.avg_total_ms || 0,
      tier2EscalationRate: row.tier2_rate || 0,
      tier1: {
        avgMatches: row.avg_tier1_matches || 0,
        avgConfidence: row.avg_tier1_conf || 0,
        avgMs: row.avg_tier1_ms || 0,
      },
      tier2: {
        avgMatches: row.avg_tier2_matches || 0,
        avgSimilarity: row.avg_tier2_sim || 0,
        avgMs: row.avg_tier2_ms || 0,
      },
    };
  }

  /**
   * Reset all metrics data
   */
  reset(): void {
    this.db.run(`DROP TABLE IF EXISTS queries`);
    this.migrate();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
