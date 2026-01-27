/**
 * ACR Logging Config
 *
 * Configuration schema for logging, metrics, and debug mode.
 * All settings controlled via ~/.config/acr/config.json
 */

import { z } from "zod";

// ============================================================================
// Default Values
// ============================================================================

const LOGGING_DEFAULTS = {
  enabled: true,
  path: "~/.config/acr/acr.log",
  maxSize: 10_000_000, // 10MB
  maxFiles: 3,
} as const;

const METRICS_DEFAULTS = {
  enabled: true,
  path: "~/.config/acr/metrics.db",
  retentionDays: 30,
} as const;

// ============================================================================
// Configuration Schema
// ============================================================================

/**
 * Schema for logging subsection
 */
const LoggingSubSchema = z.object({
  enabled: z.boolean().optional(),
  /** Path to log file (supports ~ expansion) */
  path: z.string().optional(),
  /** Max log file size in bytes before rotation */
  maxSize: z.number().optional(),
  /** Number of rotated files to keep */
  maxFiles: z.number().optional(),
});

/**
 * Schema for metrics subsection
 */
const MetricsSubSchema = z.object({
  enabled: z.boolean().optional(),
  /** Path to metrics database */
  path: z.string().optional(),
  /** Retention period in days */
  retentionDays: z.number().optional(),
});

/**
 * Schema for tier1 overrides
 */
const Tier1OverridesSchema = z.object({
  enabled: z.boolean().optional(),
  grepTimeoutMs: z.number().optional(),
  maxMatches: z.number().optional(),
});

/**
 * Schema for tier2 overrides
 */
const Tier2OverridesSchema = z.object({
  enabled: z.boolean().optional(),
  searchTimeout: z.number().optional(),
  maxResults: z.number().optional(),
  minSimilarity: z.number().optional(),
});

/**
 * Raw input schema before defaults are applied
 */
const RawConfigSchema = z.object({
  debug: z.boolean().optional(),
  logging: LoggingSubSchema.optional(),
  metrics: MetricsSubSchema.optional(),
  tier1: Tier1OverridesSchema.optional(),
  tier2: Tier2OverridesSchema.optional(),
});

/**
 * Zod schema for ACR logging configuration.
 * All fields have sensible defaults.
 */
export const LoggingConfigSchema = RawConfigSchema.transform((raw) => ({
  debug: raw.debug ?? false,
  logging: {
    enabled: raw.logging?.enabled ?? LOGGING_DEFAULTS.enabled,
    path: raw.logging?.path ?? LOGGING_DEFAULTS.path,
    maxSize: raw.logging?.maxSize ?? LOGGING_DEFAULTS.maxSize,
    maxFiles: raw.logging?.maxFiles ?? LOGGING_DEFAULTS.maxFiles,
  },
  metrics: {
    enabled: raw.metrics?.enabled ?? METRICS_DEFAULTS.enabled,
    path: raw.metrics?.path ?? METRICS_DEFAULTS.path,
    retentionDays: raw.metrics?.retentionDays ?? METRICS_DEFAULTS.retentionDays,
  },
  tier1: raw.tier1 ?? {},
  tier2: raw.tier2 ?? {},
}));

// ============================================================================
// Type Exports
// ============================================================================

/**
 * TypeScript type inferred from the Zod schema
 */
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
