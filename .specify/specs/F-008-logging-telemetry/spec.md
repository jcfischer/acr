# F-008: ACR Logging, Metrics & Debug Mode

**Status:** SPECIFY
**Created:** 2026-01-27
**Author:** Kai (PAI Algorithm)

## Overview

Add configurable logging, metrics collection, and debug mode to ACR. All settings controlled via a JSON config file that can be edited without code changes.

## Problem Statement

ACR currently has:
- `--status` command showing index counts
- No query logging or success tracking
- No timing metrics or hit/miss rates
- No debug mode for troubleshooting
- Config via inline constants + env vars only

Users need:
- Toggle debug output without code changes
- Track query performance over time
- Log successful operations for observability
- File-based config for easy editing

## Design

### Config File Location

```
~/.config/acr/config.json
```

Falls back to built-in defaults if file doesn't exist. Config is loaded once at startup and cached.

### Config Schema

```typescript
// src/logging-config.ts

import { z } from "zod";

export const LoggingConfigSchema = z.object({
  /** Enable debug output to stderr */
  debug: z.boolean().default(false),

  /** Log successful queries to file */
  logging: z.object({
    enabled: z.boolean().default(true),
    /** Path to log file (supports ~ expansion) */
    path: z.string().default("~/.config/acr/acr.log"),
    /** Max log file size in bytes before rotation */
    maxSize: z.number().default(10_000_000), // 10MB
    /** Number of rotated files to keep */
    maxFiles: z.number().default(3),
  }).default({}),

  /** Metrics collection */
  metrics: z.object({
    enabled: z.boolean().default(true),
    /** Path to metrics database */
    path: z.string().default("~/.config/acr/metrics.db"),
    /** Retention period in days */
    retentionDays: z.number().default(30),
  }).default({}),

  /** Tier 1 overrides (merged with TIER1_CONFIG) */
  tier1: z.object({
    enabled: z.boolean().optional(),
    grepTimeoutMs: z.number().optional(),
    maxMatches: z.number().optional(),
  }).default({}),

  /** Tier 2 overrides (merged with TIER2_CONFIG) */
  tier2: z.object({
    enabled: z.boolean().optional(),
    searchTimeout: z.number().optional(),
    maxResults: z.number().optional(),
    minSimilarity: z.number().optional(),
  }).default({}),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
```

### Example Config File

```json
{
  "debug": false,
  "logging": {
    "enabled": true,
    "path": "~/.config/acr/acr.log",
    "maxSize": 10000000,
    "maxFiles": 3
  },
  "metrics": {
    "enabled": true,
    "path": "~/.config/acr/metrics.db",
    "retentionDays": 30
  },
  "tier1": {
    "grepTimeoutMs": 100
  },
  "tier2": {
    "minSimilarity": 0.5
  }
}
```

### Debug Mode Output

When `debug: true`, output to stderr:

```
[ACR DEBUG] Query: "supertag-cli learnings"
[ACR DEBUG] Entities extracted: ["supertag-cli", "learnings"]
[ACR DEBUG] Tier 1: 8 matches in 45ms
[ACR DEBUG] Tier 1 confidence: 0.60, escalating to Tier 2
[ACR DEBUG] Tier 2: generating embedding...
[ACR DEBUG] Tier 2: embedding generated in 89ms (1024 dims)
[ACR DEBUG] Tier 2: vector search returned 10 results in 23ms
[ACR DEBUG] Tier 2: top similarity 0.75, min 0.62
[ACR DEBUG] Total time: 157ms
```

### Log File Format

JSONL format for easy parsing:

```jsonl
{"ts":"2026-01-27T17:30:00.000Z","query":"supertag-cli learnings","tier1":{"matches":8,"confidence":0.6,"ms":45},"tier2":{"matches":10,"topSim":0.75,"ms":112},"totalMs":157}
{"ts":"2026-01-27T17:31:00.000Z","query":"PAI Algorithm","tier1":{"matches":20,"confidence":1.0,"ms":32},"tier2":null,"totalMs":32}
```

### Metrics Database Schema

SQLite database for aggregated metrics:

```sql
-- Query metrics
CREATE TABLE queries (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  query_hash TEXT NOT NULL,  -- SHA256 of query (privacy)
  query_length INTEGER NOT NULL,

  -- Tier 1 metrics
  tier1_matches INTEGER,
  tier1_confidence REAL,
  tier1_ms INTEGER,

  -- Tier 2 metrics (null if not escalated)
  tier2_escalated INTEGER DEFAULT 0,
  tier2_matches INTEGER,
  tier2_top_similarity REAL,
  tier2_ms INTEGER,

  -- Totals
  total_ms INTEGER NOT NULL,

  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_queries_timestamp ON queries(timestamp);
CREATE INDEX idx_queries_hash ON queries(query_hash);

-- Daily aggregates (computed periodically)
CREATE TABLE daily_stats (
  date TEXT PRIMARY KEY,  -- YYYY-MM-DD
  total_queries INTEGER,
  avg_tier1_ms REAL,
  avg_tier2_ms REAL,
  tier2_escalation_rate REAL,
  avg_tier1_confidence REAL,
  avg_tier2_similarity REAL
);
```

### New CLI Commands

```bash
# Show metrics summary
acr --metrics

# Output:
# ACR Metrics (last 7 days)
# ========================
# Total queries: 142
# Avg response time: 89ms
# Tier 2 escalation rate: 34%
#
# Tier 1:
#   Avg matches: 12.3
#   Avg confidence: 0.72
#   Avg time: 42ms
#
# Tier 2:
#   Avg matches: 8.1
#   Avg similarity: 0.68
#   Avg time: 98ms

# Show recent queries (debug)
acr --log [n=10]

# Reset metrics
acr --metrics-reset

# Show current config
acr --config
```

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `src/logging-config.ts` | Config schema, loading, validation |
| `src/logger.ts` | Logger class with file rotation |
| `src/metrics.ts` | Metrics collection and SQLite storage |
| `src/debug.ts` | Debug output utilities |
| `tests/logging-config.test.ts` | Config loading tests |
| `tests/logger.test.ts` | Logger tests |
| `tests/metrics.test.ts` | Metrics tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/cli.ts` | Add --metrics, --log, --config commands |
| `src/tier1.ts` | Add timing, call logger |
| `src/tier2-resona.ts` | Add timing, call logger |
| `src/config.ts` | Load from config file, merge with defaults |
| `src/tier2-config.ts` | Load from config file, merge with defaults |

### Config Loading Flow

```typescript
// src/logging-config.ts

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".config/acr/config.json");

let cachedConfig: LoggingConfig | null = null;

export function getLoggingConfig(): LoggingConfig {
  if (cachedConfig) return cachedConfig;

  // Ensure directory exists
  const configDir = dirname(CONFIG_PATH);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Load or create default
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      cachedConfig = LoggingConfigSchema.parse(raw);
    } catch (e) {
      console.error(`[ACR] Invalid config at ${CONFIG_PATH}:`, e);
      cachedConfig = LoggingConfigSchema.parse({});
    }
  } else {
    cachedConfig = LoggingConfigSchema.parse({});
    // Write default config for user reference
    writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2));
  }

  return cachedConfig;
}

export function isDebugEnabled(): boolean {
  return getLoggingConfig().debug;
}

export function debug(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.error("[ACR DEBUG]", ...args);
  }
}
```

### Logger Class

```typescript
// src/logger.ts

import { appendFileSync, statSync, renameSync, existsSync } from "fs";
import { getLoggingConfig } from "./logging-config";

export interface QueryLogEntry {
  ts: string;
  query: string;
  tier1: {
    matches: number;
    confidence: number;
    ms: number;
  };
  tier2: {
    matches: number;
    topSim: number;
    ms: number;
  } | null;
  totalMs: number;
}

export class Logger {
  private config = getLoggingConfig();

  log(entry: QueryLogEntry): void {
    if (!this.config.logging.enabled) return;

    const path = this.expandPath(this.config.logging.path);

    // Rotate if needed
    this.rotateIfNeeded(path);

    // Append entry
    appendFileSync(path, JSON.stringify(entry) + "\n");
  }

  private rotateIfNeeded(path: string): void {
    if (!existsSync(path)) return;

    const stats = statSync(path);
    if (stats.size < this.config.logging.maxSize) return;

    // Rotate files
    for (let i = this.config.logging.maxFiles - 1; i >= 1; i--) {
      const from = i === 1 ? path : `${path}.${i - 1}`;
      const to = `${path}.${i}`;
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }
  }

  private expandPath(p: string): string {
    return p.replace(/^~/, process.env.HOME || "");
  }
}
```

### Metrics Class

```typescript
// src/metrics.ts

import Database from "bun:sqlite";
import { getLoggingConfig } from "./logging-config";

export interface QueryMetrics {
  queryHash: string;
  queryLength: number;
  tier1Matches: number;
  tier1Confidence: number;
  tier1Ms: number;
  tier2Escalated: boolean;
  tier2Matches?: number;
  tier2TopSimilarity?: number;
  tier2Ms?: number;
  totalMs: number;
}

export class MetricsStore {
  private db: Database;
  private config = getLoggingConfig();

  constructor() {
    const path = this.expandPath(this.config.metrics.path);
    this.db = new Database(path);
    this.migrate();
  }

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

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON queries(timestamp)`);
  }

  record(metrics: QueryMetrics): void {
    if (!this.config.metrics.enabled) return;

    this.db.run(`
      INSERT INTO queries (
        timestamp, query_hash, query_length,
        tier1_matches, tier1_confidence, tier1_ms,
        tier2_escalated, tier2_matches, tier2_top_similarity, tier2_ms,
        total_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
      metrics.totalMs,
    ]);

    // Cleanup old records
    this.cleanup();
  }

  private cleanup(): void {
    const cutoff = Date.now() - (this.config.metrics.retentionDays * 24 * 60 * 60 * 1000);
    this.db.run(`DELETE FROM queries WHERE timestamp < ?`, [cutoff]);
  }

  getSummary(days = 7): MetricsSummary {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    const row = this.db.query(`
      SELECT
        COUNT(*) as total_queries,
        AVG(tier1_ms) as avg_tier1_ms,
        AVG(CASE WHEN tier2_escalated = 1 THEN tier2_ms END) as avg_tier2_ms,
        AVG(tier2_escalated) as tier2_rate,
        AVG(tier1_confidence) as avg_tier1_conf,
        AVG(CASE WHEN tier2_escalated = 1 THEN tier2_top_similarity END) as avg_tier2_sim,
        AVG(tier1_matches) as avg_tier1_matches,
        AVG(CASE WHEN tier2_escalated = 1 THEN tier2_matches END) as avg_tier2_matches,
        AVG(total_ms) as avg_total_ms
      FROM queries
      WHERE timestamp > ?
    `).get(cutoff) as any;

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

  private expandPath(p: string): string {
    return p.replace(/^~/, process.env.HOME || "");
  }
}

export interface MetricsSummary {
  totalQueries: number;
  avgTotalMs: number;
  tier2EscalationRate: number;
  tier1: {
    avgMatches: number;
    avgConfidence: number;
    avgMs: number;
  };
  tier2: {
    avgMatches: number;
    avgSimilarity: number;
    avgMs: number;
  };
}
```

## Testing

### Config Loading Tests

```typescript
// tests/logging-config.test.ts

describe("LoggingConfig", () => {
  it("returns defaults when no config file", () => {
    const config = getLoggingConfig();
    expect(config.debug).toBe(false);
    expect(config.logging.enabled).toBe(true);
  });

  it("merges partial config with defaults", () => {
    // Write partial config
    writeFileSync(CONFIG_PATH, JSON.stringify({ debug: true }));

    const config = getLoggingConfig();
    expect(config.debug).toBe(true);
    expect(config.logging.enabled).toBe(true); // Default
  });

  it("validates config values", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      metrics: { retentionDays: -1 }
    }));

    // Should use defaults on invalid
    const config = getLoggingConfig();
    expect(config.metrics.retentionDays).toBe(30);
  });
});
```

### Logger Tests

```typescript
// tests/logger.test.ts

describe("Logger", () => {
  it("writes JSONL entries", () => {
    const logger = new Logger();
    logger.log({
      ts: "2026-01-27T00:00:00Z",
      query: "test",
      tier1: { matches: 5, confidence: 0.8, ms: 30 },
      tier2: null,
      totalMs: 30,
    });

    const content = readFileSync(LOG_PATH, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.query).toBe("test");
  });

  it("rotates when max size exceeded", () => {
    // ... rotation test
  });
});
```

### Metrics Tests

```typescript
// tests/metrics.test.ts

describe("MetricsStore", () => {
  it("records and retrieves metrics", () => {
    const store = new MetricsStore();
    store.record({
      queryHash: "abc123",
      queryLength: 20,
      tier1Matches: 10,
      tier1Confidence: 0.8,
      tier1Ms: 40,
      tier2Escalated: false,
      totalMs: 40,
    });

    const summary = store.getSummary(1);
    expect(summary.totalQueries).toBe(1);
    expect(summary.tier1.avgConfidence).toBe(0.8);
  });

  it("cleans up old records", () => {
    // ... cleanup test
  });
});
```

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Config loads from ~/.config/acr/config.json | File read on startup |
| 2 | Debug mode toggleable via config.debug | stderr output when true |
| 3 | Query metrics stored in SQLite | metrics.db populated |
| 4 | Log file with rotation support | JSONL file with .1, .2 backups |
| 5 | --metrics shows summary stats | CLI output with rates |
| 6 | --config shows current settings | JSON output |
| 7 | All existing tests pass | bun test succeeds |

## Migration Notes

- No breaking changes to existing CLI behavior
- Default config created on first run
- Existing env vars (ACR_ENABLED, ACR_TIER2_ENABLED) still work
- Config file settings override env vars

## Future Enhancements

- [ ] Remote telemetry endpoint (opt-in)
- [ ] Query pattern analysis
- [ ] Embedding quality tracking
- [ ] Dashboard visualization
