/**
 * ACR Tier 4 - Type Definitions for Forgetting Policies
 *
 * Types for temporal decay and TTL management.
 * "Graceful forgetting is a feature, not a bug." - The Skeptic
 */

import { z } from "zod";

// ============================================================================
// ContentType - Classification for half-life assignment
// ============================================================================

export const ContentTypeSchema = z.enum([
  "identity",    // DAIDENTITY.md, core preferences - 180 days
  "contacts",    // CONTACTS/ directory - 90 days
  "projects",    // TELOS/PROJECTS.md - 60 days
  "learnings",   // TELOS/LEARNED.md - 45 days
  "sessions",    // Maestro synopses - 30 days
  "operational", // Task-specific context - 14 days
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

// ============================================================================
// Half-life configuration
// ============================================================================

/**
 * Half-life values in days for each content type.
 * After this many days, confidence is reduced by 50%.
 */
export const HALF_LIFE_DAYS: Record<ContentType, number> = {
  identity: 180,    // Core identity persists longest
  contacts: 90,     // Relationships fade slower than tasks
  projects: 60,     // Project context moderately persistent
  learnings: 45,    // Learnings decay moderately
  sessions: 30,     // Session synopses: 30-day half-life default
  operational: 14,  // Task-specific context fades fastest
};

// ============================================================================
// ContentMetadata - Timestamp and TTL info
// ============================================================================

export const ContentMetadataSchema = z.object({
  /** When the content was created */
  created: z.date(),
  /** When the content was last updated */
  updated: z.date(),
  /** TTL override: 0=permanent, -1=use default decay, N=expire after N days */
  ttl: z.number().int().optional(),
  /** Classified content type */
  contentType: ContentTypeSchema,
  /** Reason for marking permanent (if ttl=0) */
  preserveReason: z.string().optional(),
});

export type ContentMetadata = z.infer<typeof ContentMetadataSchema>;

// ============================================================================
// DecayedResult - Result with temporal adjustment
// ============================================================================

export const DecayedResultSchema = z.object({
  /** Original confidence before decay */
  rawConfidence: z.number().min(0).max(1),
  /** Confidence after applying temporal decay */
  decayedConfidence: z.number().min(0).max(1),
  /** Age of content in days */
  ageDays: z.number().nonnegative(),
  /** Decay factor applied (0.0 to 1.0) */
  decayFactor: z.number().min(0).max(1),
  /** Content type used for half-life calculation */
  contentType: ContentTypeSchema,
  /** Half-life used (in days) */
  halfLifeDays: z.number().positive(),
  /** Whether decay was bypassed (ttl=0 or historical mode) */
  decayBypassed: z.boolean(),
});

export type DecayedResult = z.infer<typeof DecayedResultSchema>;

// ============================================================================
// Tier4Config - Configuration for Forgetting Policies
// ============================================================================

/**
 * Schema for partial half-life overrides.
 * Allows overriding only specific content types.
 */
const HalfLifeOverridesSchema = z
  .object({
    identity: z.number().positive().optional(),
    contacts: z.number().positive().optional(),
    projects: z.number().positive().optional(),
    learnings: z.number().positive().optional(),
    sessions: z.number().positive().optional(),
    operational: z.number().positive().optional(),
  })
  .optional();

export const Tier4ConfigSchema = z.object({
  /** Enable temporal decay (default: true) */
  enabled: z.boolean().default(true),
  /** Minimum effective confidence after decay (below this = candidate for archive) */
  archiveThreshold: z.number().min(0).max(1).default(0.1),
  /** Historical mode: disable decay for all queries */
  historicalMode: z.boolean().default(false),
  /** Custom half-life overrides per content type */
  halfLifeOverrides: HalfLifeOverridesSchema,
});

export type Tier4Config = z.infer<typeof Tier4ConfigSchema>;

// ============================================================================
// DecayOptions - Options for decay calculation
// ============================================================================

export const DecayOptionsSchema = z.object({
  /** Reference date for age calculation (default: now) */
  referenceDate: z.date().optional(),
  /** Override the content type for this calculation */
  contentTypeOverride: ContentTypeSchema.optional(),
  /** Override the half-life (in days) for this calculation */
  halfLifeOverride: z.number().positive().optional(),
  /** Skip decay entirely (return raw confidence) */
  skipDecay: z.boolean().optional(),
});

export type DecayOptions = z.infer<typeof DecayOptionsSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create default Tier4Config with environment overrides
 */
export function createDefaultTier4Config(): Tier4Config {
  return Tier4ConfigSchema.parse({
    enabled: process.env.ACR_DECAY_ENABLED !== "false",
    historicalMode: process.env.ACR_HISTORICAL_MODE === "true",
  });
}

/**
 * Get the half-life for a content type, considering config overrides
 */
export function getHalfLife(
  contentType: ContentType,
  config?: Tier4Config
): number {
  if (config?.halfLifeOverrides?.[contentType]) {
    return config.halfLifeOverrides[contentType];
  }
  return HALF_LIFE_DAYS[contentType];
}

/**
 * Create an empty DecayedResult for testing/initialization
 */
export function createDecayedResult(
  rawConfidence: number,
  contentType: ContentType = "operational"
): DecayedResult {
  return {
    rawConfidence,
    decayedConfidence: rawConfidence,
    ageDays: 0,
    decayFactor: 1.0,
    contentType,
    halfLifeDays: HALF_LIFE_DAYS[contentType],
    decayBypassed: false,
  };
}
