/**
 * ACR Tier 3 - Session State Management
 *
 * Tracks user rejections and approvals within a session.
 * Implements FR-5 from F-003 spec.
 */

import type { SessionACRState } from "./tier3-types";
import { createSessionACRState, SessionACRStateSchema } from "./tier3-types";

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create a fresh session state.
 */
export function initSessionState(): SessionACRState {
  return createSessionACRState();
}

/**
 * Validate and parse session state from unknown input.
 */
export function parseSessionState(input: unknown): SessionACRState | null {
  const result = SessionACRStateSchema.safeParse(input);
  return result.success ? result.data : null;
}

// ============================================================================
// Entity Rejection
// ============================================================================

/**
 * Add an entity to the rejection list.
 *
 * Per spec FR-5: Rejected entities not re-asked within same session.
 */
export function rejectEntity(
  state: SessionACRState,
  entity: string
): SessionACRState {
  const normalizedEntity = entity.toLowerCase().trim();

  // Check if already rejected
  if (
    state.rejectedEntities.some(
      (e) => e.toLowerCase() === normalizedEntity
    )
  ) {
    return state;
  }

  return {
    ...state,
    rejectedEntities: [...state.rejectedEntities, entity],
  };
}

/**
 * Check if an entity has been rejected.
 */
export function isRejected(
  state: SessionACRState,
  entity: string
): boolean {
  const normalizedEntity = entity.toLowerCase().trim();
  return state.rejectedEntities.some(
    (e) => e.toLowerCase() === normalizedEntity
  );
}

/**
 * Remove an entity from the rejection list.
 *
 * Useful if user explicitly asks to reconsider.
 */
export function unrejectEntity(
  state: SessionACRState,
  entity: string
): SessionACRState {
  const normalizedEntity = entity.toLowerCase().trim();
  return {
    ...state,
    rejectedEntities: state.rejectedEntities.filter(
      (e) => e.toLowerCase() !== normalizedEntity
    ),
  };
}

// ============================================================================
// Source Approval
// ============================================================================

/**
 * Add a source to the approved list.
 */
export function approveSource(
  state: SessionACRState,
  source: string
): SessionACRState {
  return {
    ...state,
    acceptedSources: {
      ...state.acceptedSources,
      [source]: Date.now(),
    },
  };
}

/**
 * Check if a source has been approved.
 */
export function isApproved(
  state: SessionACRState,
  source: string
): boolean {
  const normalizedSource = source.toLowerCase();
  return Object.keys(state.acceptedSources).some(
    (s) => s.toLowerCase() === normalizedSource
  );
}

/**
 * Remove a source from the approved list.
 */
export function unapproveSource(
  state: SessionACRState,
  source: string
): SessionACRState {
  const { [source]: removed, ...rest } = state.acceptedSources;
  return {
    ...state,
    acceptedSources: rest,
  };
}

/**
 * Get the timestamp when a source was approved.
 */
export function getApprovalTime(
  state: SessionACRState,
  source: string
): number | null {
  return state.acceptedSources[source] ?? null;
}

// ============================================================================
// Injection Tracking
// ============================================================================

/**
 * Record that an injection occurred.
 */
export function recordInjection(
  state: SessionACRState,
  tokenCount: number
): SessionACRState {
  return {
    ...state,
    injectionCount: state.injectionCount + 1,
    totalTokensInjected: state.totalTokensInjected + tokenCount,
  };
}

/**
 * Get the number of injections this session.
 */
export function getInjectionCount(state: SessionACRState): number {
  return state.injectionCount;
}

/**
 * Get the total tokens injected this session.
 */
export function getTotalTokensInjected(state: SessionACRState): number {
  return state.totalTokensInjected;
}

// ============================================================================
// Session Duration
// ============================================================================

/**
 * Get session duration in milliseconds.
 */
export function getSessionDuration(state: SessionACRState): number {
  return Date.now() - state.sessionStartMs;
}

/**
 * Get session duration in minutes.
 */
export function getSessionDurationMinutes(state: SessionACRState): number {
  return Math.floor(getSessionDuration(state) / 60000);
}

// ============================================================================
// State Summary
// ============================================================================

/**
 * Get a summary of session state for debugging.
 */
export function getStateSummary(state: SessionACRState): {
  rejectedCount: number;
  approvedCount: number;
  injectionCount: number;
  totalTokensInjected: number;
  sessionDurationMinutes: number;
} {
  return {
    rejectedCount: state.rejectedEntities.length,
    approvedCount: Object.keys(state.acceptedSources).length,
    injectionCount: state.injectionCount,
    totalTokensInjected: state.totalTokensInjected,
    sessionDurationMinutes: getSessionDurationMinutes(state),
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize session state to JSON.
 */
export function serializeState(state: SessionACRState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize session state from JSON.
 */
export function deserializeState(json: string): SessionACRState | null {
  try {
    const parsed = JSON.parse(json);
    return parseSessionState(parsed);
  } catch {
    return null;
  }
}

// ============================================================================
// State Reset
// ============================================================================

/**
 * Reset all state to fresh.
 */
export function resetState(): SessionACRState {
  return initSessionState();
}

/**
 * Reset only rejections (keep approvals).
 */
export function resetRejections(state: SessionACRState): SessionACRState {
  return {
    ...state,
    rejectedEntities: [],
  };
}

/**
 * Reset only approvals (keep rejections).
 */
export function resetApprovals(state: SessionACRState): SessionACRState {
  return {
    ...state,
    acceptedSources: {},
  };
}
