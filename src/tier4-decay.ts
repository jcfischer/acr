/**
 * ACR Tier 4 - Temporal Decay Calculation
 *
 * Implements the half-life decay model for context confidence.
 * Operational details fade while emotional truth persists.
 */

import type {
  ContentType,
  DecayedResult,
  DecayOptions,
  Tier4Config,
  ContentMetadata,
} from "./tier4-types";
import {
  HALF_LIFE_DAYS,
  getHalfLife,
  createDefaultTier4Config,
} from "./tier4-types";

// ============================================================================
// Constants
// ============================================================================

/** Milliseconds in a day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// Core Decay Calculation
// ============================================================================

/**
 * Calculate the temporal decay factor based on age and half-life.
 *
 * Uses exponential decay formula: factor = 0.5 ^ (age / halfLife)
 *
 * Examples:
 * - Age 0 days: factor = 1.0 (no decay)
 * - Age = half-life: factor = 0.5 (50% decay)
 * - Age = 2 * half-life: factor = 0.25 (75% decay)
 * - Age = 3 * half-life: factor = 0.125 (87.5% decay)
 *
 * @param ageDays Age of content in days
 * @param halfLifeDays Half-life in days
 * @returns Decay factor between 0.0 and 1.0
 */
export function calculateDecayFactor(
  ageDays: number,
  halfLifeDays: number
): number {
  if (ageDays <= 0) {
    return 1.0; // No decay for new content
  }
  if (halfLifeDays <= 0) {
    return 1.0; // Invalid half-life, no decay
  }
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Apply temporal decay to a confidence score.
 *
 * @param confidence Original confidence score (0.0 - 1.0)
 * @param ageDays Age of content in days
 * @param halfLifeDays Half-life in days
 * @returns Decayed confidence score (0.0 - 1.0)
 */
export function applyTemporalDecay(
  confidence: number,
  ageDays: number,
  halfLifeDays: number
): number {
  const decayFactor = calculateDecayFactor(ageDays, halfLifeDays);
  return confidence * decayFactor;
}

// ============================================================================
// Age Calculation
// ============================================================================

/**
 * Calculate the age of content in days.
 *
 * @param contentDate Date the content was created/updated
 * @param referenceDate Reference date (default: now)
 * @returns Age in days (floating point for precision)
 */
export function calculateAgeDays(
  contentDate: Date,
  referenceDate: Date = new Date()
): number {
  const diffMs = referenceDate.getTime() - contentDate.getTime();
  return Math.max(0, diffMs / MS_PER_DAY);
}

/**
 * Calculate age from a Unix timestamp (milliseconds).
 *
 * @param timestampMs Unix timestamp in milliseconds
 * @param referenceMs Reference timestamp (default: now)
 * @returns Age in days
 */
export function calculateAgeDaysFromTimestamp(
  timestampMs: number,
  referenceMs: number = Date.now()
): number {
  const diffMs = referenceMs - timestampMs;
  return Math.max(0, diffMs / MS_PER_DAY);
}

// ============================================================================
// Full Decay Pipeline
// ============================================================================

/**
 * Apply full decay pipeline to a confidence score with metadata.
 *
 * Handles:
 * - TTL overrides (ttl=0 bypasses decay)
 * - Content type classification
 * - Historical mode bypass
 * - Config-based half-life overrides
 *
 * @param confidence Original confidence score
 * @param metadata Content metadata with timestamps and TTL
 * @param config Tier4 configuration
 * @param options Additional decay options
 * @returns DecayedResult with full decay details
 */
export function applyDecayWithMetadata(
  confidence: number,
  metadata: ContentMetadata,
  config: Tier4Config = createDefaultTier4Config(),
  options: DecayOptions = {}
): DecayedResult {
  const referenceDate = options.referenceDate ?? new Date();
  const contentType = options.contentTypeOverride ?? metadata.contentType;

  // Determine if decay should be bypassed
  const shouldBypass =
    !config.enabled ||
    config.historicalMode ||
    options.skipDecay ||
    metadata.ttl === 0; // TTL=0 means permanent

  if (shouldBypass) {
    return {
      rawConfidence: confidence,
      decayedConfidence: confidence,
      ageDays: calculateAgeDays(metadata.updated, referenceDate),
      decayFactor: 1.0,
      contentType,
      halfLifeDays: getHalfLife(contentType, config),
      decayBypassed: true,
    };
  }

  // Calculate age based on last update
  const ageDays = calculateAgeDays(metadata.updated, referenceDate);

  // Get half-life (options override > config override > default)
  const halfLifeDays =
    options.halfLifeOverride ?? getHalfLife(contentType, config);

  // Calculate decay
  const decayFactor = calculateDecayFactor(ageDays, halfLifeDays);
  const decayedConfidence = confidence * decayFactor;

  return {
    rawConfidence: confidence,
    decayedConfidence,
    ageDays,
    decayFactor,
    contentType,
    halfLifeDays,
    decayBypassed: false,
  };
}

/**
 * Simple decay function for when you only have basic info.
 *
 * @param confidence Original confidence score
 * @param contentType Content type for half-life lookup
 * @param ageDays Age in days
 * @param config Optional configuration
 * @returns DecayedResult
 */
export function applyDecaySimple(
  confidence: number,
  contentType: ContentType,
  ageDays: number,
  config?: Tier4Config
): DecayedResult {
  const effectiveConfig = config ?? createDefaultTier4Config();

  if (!effectiveConfig.enabled || effectiveConfig.historicalMode) {
    return {
      rawConfidence: confidence,
      decayedConfidence: confidence,
      ageDays,
      decayFactor: 1.0,
      contentType,
      halfLifeDays: getHalfLife(contentType, effectiveConfig),
      decayBypassed: true,
    };
  }

  const halfLifeDays = getHalfLife(contentType, effectiveConfig);
  const decayFactor = calculateDecayFactor(ageDays, halfLifeDays);
  const decayedConfidence = confidence * decayFactor;

  return {
    rawConfidence: confidence,
    decayedConfidence,
    ageDays,
    decayFactor,
    contentType,
    halfLifeDays,
    decayBypassed: false,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Apply decay to multiple confidence scores.
 *
 * @param items Array of { confidence, contentType, ageDays }
 * @param config Optional configuration
 * @returns Array of DecayedResults in same order
 */
export function applyDecayBatch(
  items: Array<{
    confidence: number;
    contentType: ContentType;
    ageDays: number;
  }>,
  config?: Tier4Config
): DecayedResult[] {
  return items.map((item) =>
    applyDecaySimple(item.confidence, item.contentType, item.ageDays, config)
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if content should be archived based on decayed confidence.
 *
 * @param decayedConfidence Confidence after decay
 * @param threshold Archive threshold (default: 0.1)
 * @returns True if content should be archived
 */
export function shouldArchive(
  decayedConfidence: number,
  threshold: number = 0.1
): boolean {
  return decayedConfidence < threshold;
}

/**
 * Calculate when content will reach a target confidence level.
 *
 * @param currentConfidence Current confidence
 * @param targetConfidence Target confidence level
 * @param halfLifeDays Half-life in days
 * @returns Days until target confidence is reached
 */
export function daysUntilConfidence(
  currentConfidence: number,
  targetConfidence: number,
  halfLifeDays: number
): number {
  if (targetConfidence >= currentConfidence) {
    return 0; // Already at or above target
  }
  if (targetConfidence <= 0) {
    return Infinity; // Will never reach 0
  }

  // Solve: target = current * 0.5^(days/halfLife)
  // days = halfLife * log2(current / target)
  const ratio = currentConfidence / targetConfidence;
  return halfLifeDays * Math.log2(ratio);
}

/**
 * Get a human-readable decay summary.
 *
 * @param result Decayed result
 * @returns Summary string
 */
export function getDecaySummary(result: DecayedResult): string {
  if (result.decayBypassed) {
    return `No decay (bypassed): ${(result.rawConfidence * 100).toFixed(1)}%`;
  }

  const decayPercent = ((1 - result.decayFactor) * 100).toFixed(1);
  return `${(result.rawConfidence * 100).toFixed(1)}% → ${(result.decayedConfidence * 100).toFixed(1)}% (${decayPercent}% decay over ${result.ageDays.toFixed(0)} days)`;
}
