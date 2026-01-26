/**
 * ACR Tier 3 - Type Definitions
 *
 * Types for Context Injection layer.
 * Receives results from Tier 1 (grep) and Tier 2 (Resona),
 * applies confidence-based routing, manages token budgets.
 */

import { z } from "zod";
import type { EntityMatch, GrepResult } from "./types";
import type { RankedResult, SemanticResult, SourceType } from "./tier2-types";

// ============================================================================
// Source Priority - Determines injection order
// ============================================================================

export const SOURCE_PRIORITY: Record<string, number> = {
  "user/daidentity": 100, // Highest priority - identity context
  "user/contacts": 90,
  "user/projects": 80,
  user: 70, // Generic user context
  session: 50, // Session history
  tana: 30, // External sources
};

// ============================================================================
// InjectionDecision - Routing result
// ============================================================================

export const InjectionActionSchema = z.enum([
  "inject", // Auto-inject without asking
  "ask", // Ask user before injecting
  "skip", // Don't surface at all
]);

export type InjectionAction = z.infer<typeof InjectionActionSchema>;

export const InjectionDecisionSchema = z.object({
  /** Whether to inject automatically, ask, or skip */
  action: InjectionActionSchema,
  /** Confidence score that led to this decision */
  confidence: z.number().min(0).max(1),
  /** Source of the context (file path or source type) */
  source: z.string(),
  /** Human-readable reason for the decision */
  reason: z.string(),
});

export type InjectionDecision = z.infer<typeof InjectionDecisionSchema>;

// ============================================================================
// ContextSource - Unified source for formatted context
// ============================================================================

export const ContextSourceSchema = z.object({
  /** Content to inject */
  content: z.string(),
  /** Source path or identifier */
  source: z.string(),
  /** Confidence score */
  confidence: z.number().min(0).max(1),
  /** Token count for this content */
  tokenCount: z.number().int().nonnegative(),
  /** Priority for ordering (higher = more important) */
  priority: z.number(),
  /** Whether this came from Tier 1 (grep) or Tier 2 (semantic) */
  tier: z.enum(["tier1", "tier2"]),
});

export type ContextSource = z.infer<typeof ContextSourceSchema>;

// ============================================================================
// FormattedContext - Ready-to-inject content
// ============================================================================

export const FormattedContextSchema = z.object({
  /** Formatted content ready for injection */
  content: z.string(),
  /** Total token count */
  totalTokens: z.number().int().nonnegative(),
  /** Whether content was truncated to fit budget */
  truncated: z.boolean(),
  /** Number of sources included vs total available */
  sourcesIncluded: z.number().int().nonnegative(),
  /** Total sources available before truncation */
  sourcesTotal: z.number().int().nonnegative(),
  /** Individual sources that were included */
  sources: z.array(ContextSourceSchema),
});

export type FormattedContext = z.infer<typeof FormattedContextSchema>;

// ============================================================================
// AskPatternRequest - Structure for AskUserQuestion
// ============================================================================

export const AskOptionSchema = z.object({
  /** Display label */
  label: z.string(),
  /** Description of what this option does */
  description: z.string(),
});

export type AskOption = z.infer<typeof AskOptionSchema>;

export const AskQuestionSchema = z.object({
  /** Short header for the question */
  header: z.string().max(12),
  /** Full question text */
  question: z.string(),
  /** Available options */
  options: z.array(AskOptionSchema).min(2).max(4),
  /** Whether multiple options can be selected */
  multiSelect: z.boolean(),
});

export type AskQuestion = z.infer<typeof AskQuestionSchema>;

export const AskPatternRequestSchema = z.object({
  /** Questions to ask the user */
  questions: z.array(AskQuestionSchema).min(1).max(4),
  /** Entity that triggered this ask */
  entity: z.string(),
  /** Source of the context */
  source: z.string(),
  /** Days since this context was last accessed */
  daysAgo: z.number().int().nonnegative(),
  /** Preview of the context content */
  preview: z.string(),
});

export type AskPatternRequest = z.infer<typeof AskPatternRequestSchema>;

// ============================================================================
// SessionACRState - Per-session tracking
// ============================================================================

export const SessionACRStateSchema = z.object({
  /** Entities the user has rejected (don't re-ask) */
  rejectedEntities: z.array(z.string()),
  /** Sources the user has approved (with timestamps) */
  acceptedSources: z.record(z.string(), z.number()),
  /** Total number of injections this session */
  injectionCount: z.number().int().nonnegative(),
  /** Total tokens injected this session */
  totalTokensInjected: z.number().int().nonnegative(),
  /** Session start timestamp */
  sessionStartMs: z.number(),
});

export type SessionACRState = z.infer<typeof SessionACRStateSchema>;

// ============================================================================
// Tier3Config - Configuration for Context Injection
// ============================================================================

export const Tier3ConfigSchema = z.object({
  /** Confidence threshold for automatic injection */
  autoInjectThreshold: z.number().min(0).max(1).default(0.7),
  /** Confidence threshold for asking (below this = skip) */
  askThreshold: z.number().min(0).max(1).default(0.5),
  /** Maximum tokens for ACR context */
  maxTokenBudget: z.number().int().positive().default(2000),
  /** Maximum asks per session start */
  maxAsksPerSession: z.number().int().nonnegative().default(1),
  /** Whether to show debug info */
  debug: z.boolean().default(false),
});

export type Tier3Config = z.infer<typeof Tier3ConfigSchema>;

// ============================================================================
// InjectionResult - Final output of the injection pipeline
// ============================================================================

export const InjectionResultSchema = z.object({
  /** Context ready for injection (if any) */
  formattedContext: FormattedContextSchema.nullable(),
  /** Ask pattern to present to user (if asking) */
  askPattern: AskPatternRequestSchema.nullable(),
  /** Decisions made for each source */
  decisions: z.array(InjectionDecisionSchema),
  /** Latency in milliseconds */
  latencyMs: z.number().nonnegative(),
  /** Whether any context was injected or queued for asking */
  hasContext: z.boolean(),
  /** Debug info (if enabled) */
  debugInfo: z.record(z.string(), z.unknown()).optional(),
});

export type InjectionResult = z.infer<typeof InjectionResultSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty InjectionResult
 */
export function createEmptyInjectionResult(latencyMs: number = 0): InjectionResult {
  return {
    formattedContext: null,
    askPattern: null,
    decisions: [],
    latencyMs,
    hasContext: false,
  };
}

/**
 * Create a new SessionACRState
 */
export function createSessionACRState(): SessionACRState {
  return {
    rejectedEntities: [],
    acceptedSources: {},
    injectionCount: 0,
    totalTokensInjected: 0,
    sessionStartMs: Date.now(),
  };
}

/**
 * Create default Tier3Config with environment overrides
 */
export function createDefaultTier3Config(): Tier3Config {
  return Tier3ConfigSchema.parse({
    debug: process.env.ACR_DEBUG === "true",
  });
}

/**
 * Get source priority for ordering
 */
export function getSourcePriority(source: string): number {
  // Check for exact match first
  if (source in SOURCE_PRIORITY) {
    return SOURCE_PRIORITY[source];
  }

  // Check for prefix match (e.g., "user/contacts/john.md" matches "user/contacts")
  const lowerSource = source.toLowerCase();
  for (const [key, priority] of Object.entries(SOURCE_PRIORITY)) {
    if (lowerSource.startsWith(key.toLowerCase())) {
      return priority;
    }
  }

  // Default priority for unknown sources
  return 0;
}
