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

// ============================================================================
// Path Utilities
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Default config path
 */
export const CONFIG_PATH = "~/.config/acr/config.json";

/**
 * Expand ~ to HOME directory in paths
 */
export function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Cached config instance
 */
let configCache: LoggingConfig | null = null;
let configCachePath: string | null = null;

/**
 * Reset config cache (for testing)
 */
export function resetConfigCache(): void {
  configCache = null;
  configCachePath = null;
}

/**
 * Get default config object
 */
function getDefaultConfig(): LoggingConfig {
  const result = LoggingConfigSchema.parse({});
  return result;
}

/**
 * Load and validate config from file, with caching.
 * Creates directory and writes defaults if config doesn't exist.
 *
 * @param configPath - Path to config file (default: ~/.config/acr/config.json)
 * @returns Validated LoggingConfig
 */
export function getLoggingConfig(
  configPath: string = CONFIG_PATH
): LoggingConfig {
  const expandedPath = expandPath(configPath);

  // Return cached config if same path
  if (configCache !== null && configCachePath === expandedPath) {
    return configCache;
  }

  const configDir = path.dirname(expandedPath);

  // Create directory if missing
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // If config file doesn't exist, write defaults
  if (!fs.existsSync(expandedPath)) {
    const defaults = getDefaultConfig();
    try {
      fs.writeFileSync(expandedPath, JSON.stringify(defaults, null, 2));
    } catch {
      // Ignore write errors, just use defaults
    }
    configCache = defaults;
    configCachePath = expandedPath;
    return defaults;
  }

  // Read and parse existing config
  try {
    const content = fs.readFileSync(expandedPath, "utf-8");
    const parsed = JSON.parse(content);
    const result = LoggingConfigSchema.safeParse(parsed);

    if (result.success) {
      configCache = result.data;
      configCachePath = expandedPath;
      return result.data;
    }

    // Validation error - return defaults
    const defaults = getDefaultConfig();
    configCache = defaults;
    configCachePath = expandedPath;
    return defaults;
  } catch {
    // Parse error - return defaults
    const defaults = getDefaultConfig();
    configCache = defaults;
    configCachePath = expandedPath;
    return defaults;
  }
}

// ============================================================================
// Helper Functions (T-003)
// ============================================================================

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(configPath: string = CONFIG_PATH): boolean {
  return getLoggingConfig(configPath).debug;
}

/**
 * Conditional debug output to stderr
 */
export function debug(...args: unknown[]): void {
  // Check if last argument is a config path (string ending with .json)
  let configPath = CONFIG_PATH;
  let debugArgs = args;

  const lastArg = args[args.length - 1];
  if (
    typeof lastArg === "string" &&
    lastArg.endsWith(".json") &&
    args.length > 1
  ) {
    configPath = lastArg;
    debugArgs = args.slice(0, -1);
  }

  if (isDebugEnabled(configPath)) {
    const message = debugArgs
      .map((a) => (typeof a === "string" ? a : String(a)))
      .join(" ");
    process.stderr.write(`[ACR DEBUG] ${message}\n`);
  }
}
