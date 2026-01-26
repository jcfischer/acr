/**
 * Tests for ACR Tier 3 Session State Management
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  initSessionState,
  parseSessionState,
  rejectEntity,
  isRejected,
  unrejectEntity,
  approveSource,
  isApproved,
  unapproveSource,
  getApprovalTime,
  recordInjection,
  getInjectionCount,
  getTotalTokensInjected,
  getSessionDuration,
  getSessionDurationMinutes,
  getStateSummary,
  serializeState,
  deserializeState,
  resetState,
  resetRejections,
  resetApprovals,
} from "../src/tier3-session-state";
import type { SessionACRState } from "../src/tier3-types";

describe("initSessionState", () => {
  it("should create fresh state", () => {
    const state = initSessionState();

    expect(state.rejectedEntities).toEqual([]);
    expect(state.acceptedSources).toEqual({});
    expect(state.injectionCount).toBe(0);
    expect(state.totalTokensInjected).toBe(0);
    expect(state.sessionStartMs).toBeGreaterThan(0);
  });

  it("should have current timestamp", () => {
    const before = Date.now();
    const state = initSessionState();
    const after = Date.now();

    expect(state.sessionStartMs).toBeGreaterThanOrEqual(before);
    expect(state.sessionStartMs).toBeLessThanOrEqual(after);
  });
});

describe("parseSessionState", () => {
  it("should parse valid state", () => {
    const input = {
      rejectedEntities: ["John"],
      acceptedSources: { "user/test.md": 123456 },
      injectionCount: 5,
      totalTokensInjected: 500,
      sessionStartMs: 123456789,
    };

    const state = parseSessionState(input);

    expect(state).not.toBeNull();
    expect(state!.rejectedEntities).toEqual(["John"]);
  });

  it("should return null for invalid state", () => {
    expect(parseSessionState(null)).toBeNull();
    expect(parseSessionState(undefined)).toBeNull();
    expect(parseSessionState({ invalid: true })).toBeNull();
  });
});

describe("Entity Rejection", () => {
  let state: SessionACRState;

  beforeEach(() => {
    state = initSessionState();
  });

  describe("rejectEntity", () => {
    it("should add entity to rejections", () => {
      const newState = rejectEntity(state, "John");

      expect(newState.rejectedEntities).toContain("John");
    });

    it("should not duplicate rejections", () => {
      let newState = rejectEntity(state, "John");
      newState = rejectEntity(newState, "john"); // Case variation

      expect(newState.rejectedEntities).toHaveLength(1);
    });

    it("should preserve original state immutably", () => {
      const newState = rejectEntity(state, "John");

      expect(state.rejectedEntities).toEqual([]);
      expect(newState.rejectedEntities).toContain("John");
    });
  });

  describe("isRejected", () => {
    it("should return false for non-rejected entity", () => {
      expect(isRejected(state, "John")).toBe(false);
    });

    it("should return true for rejected entity", () => {
      const newState = rejectEntity(state, "John");

      expect(isRejected(newState, "John")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const newState = rejectEntity(state, "John");

      expect(isRejected(newState, "john")).toBe(true);
      expect(isRejected(newState, "JOHN")).toBe(true);
    });
  });

  describe("unrejectEntity", () => {
    it("should remove entity from rejections", () => {
      let newState = rejectEntity(state, "John");
      newState = unrejectEntity(newState, "John");

      expect(newState.rejectedEntities).not.toContain("John");
    });

    it("should be case-insensitive", () => {
      let newState = rejectEntity(state, "John");
      newState = unrejectEntity(newState, "JOHN");

      expect(newState.rejectedEntities).toHaveLength(0);
    });

    it("should handle non-existent entity", () => {
      const newState = unrejectEntity(state, "NotRejected");

      expect(newState.rejectedEntities).toEqual([]);
    });
  });
});

describe("Source Approval", () => {
  let state: SessionACRState;

  beforeEach(() => {
    state = initSessionState();
  });

  describe("approveSource", () => {
    it("should add source with timestamp", () => {
      const before = Date.now();
      const newState = approveSource(state, "user/contacts/john.md");
      const after = Date.now();

      expect("user/contacts/john.md" in newState.acceptedSources).toBe(true);
      expect(newState.acceptedSources["user/contacts/john.md"]).toBeGreaterThanOrEqual(before);
      expect(newState.acceptedSources["user/contacts/john.md"]).toBeLessThanOrEqual(after);
    });

    it("should update timestamp on re-approval", async () => {
      let newState = approveSource(state, "user/test.md");
      const firstTime = newState.acceptedSources["user/test.md"];

      // Wait a bit
      await new Promise((r) => setTimeout(r, 5));

      newState = approveSource(newState, "user/test.md");
      const secondTime = newState.acceptedSources["user/test.md"];

      expect(secondTime).toBeGreaterThanOrEqual(firstTime);
    });
  });

  describe("isApproved", () => {
    it("should return false for non-approved source", () => {
      expect(isApproved(state, "user/test.md")).toBe(false);
    });

    it("should return true for approved source", () => {
      const newState = approveSource(state, "user/test.md");

      expect(isApproved(newState, "user/test.md")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const newState = approveSource(state, "user/test.md");

      expect(isApproved(newState, "USER/TEST.MD")).toBe(true);
    });
  });

  describe("unapproveSource", () => {
    it("should remove source from approvals", () => {
      let newState = approveSource(state, "user/test.md");
      newState = unapproveSource(newState, "user/test.md");

      expect(isApproved(newState, "user/test.md")).toBe(false);
    });
  });

  describe("getApprovalTime", () => {
    it("should return timestamp for approved source", () => {
      const newState = approveSource(state, "user/test.md");
      const time = getApprovalTime(newState, "user/test.md");

      expect(time).not.toBeNull();
      expect(time).toBeGreaterThan(0);
    });

    it("should return null for non-approved source", () => {
      expect(getApprovalTime(state, "user/test.md")).toBeNull();
    });
  });
});

describe("Injection Tracking", () => {
  let state: SessionACRState;

  beforeEach(() => {
    state = initSessionState();
  });

  describe("recordInjection", () => {
    it("should increment injection count", () => {
      const newState = recordInjection(state, 100);

      expect(newState.injectionCount).toBe(1);
    });

    it("should add to total tokens", () => {
      const newState = recordInjection(state, 100);

      expect(newState.totalTokensInjected).toBe(100);
    });

    it("should accumulate multiple injections", () => {
      let newState = recordInjection(state, 100);
      newState = recordInjection(newState, 200);
      newState = recordInjection(newState, 150);

      expect(newState.injectionCount).toBe(3);
      expect(newState.totalTokensInjected).toBe(450);
    });
  });

  describe("getInjectionCount", () => {
    it("should return current count", () => {
      expect(getInjectionCount(state)).toBe(0);

      const newState = recordInjection(state, 50);
      expect(getInjectionCount(newState)).toBe(1);
    });
  });

  describe("getTotalTokensInjected", () => {
    it("should return current total", () => {
      expect(getTotalTokensInjected(state)).toBe(0);

      const newState = recordInjection(state, 200);
      expect(getTotalTokensInjected(newState)).toBe(200);
    });
  });
});

describe("Session Duration", () => {
  it("should calculate duration in ms", () => {
    const state = initSessionState();

    // Wait a bit
    const duration = getSessionDuration(state);

    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(1000); // Should be very short
  });

  it("should calculate duration in minutes", () => {
    const state = initSessionState();
    const minutes = getSessionDurationMinutes(state);

    expect(minutes).toBe(0); // New session, less than a minute
  });
});

describe("getStateSummary", () => {
  it("should return complete summary", () => {
    let state = initSessionState();
    state = rejectEntity(state, "John");
    state = rejectEntity(state, "Jane");
    state = approveSource(state, "user/test.md");
    state = recordInjection(state, 500);
    state = recordInjection(state, 300);

    const summary = getStateSummary(state);

    expect(summary.rejectedCount).toBe(2);
    expect(summary.approvedCount).toBe(1);
    expect(summary.injectionCount).toBe(2);
    expect(summary.totalTokensInjected).toBe(800);
    expect(summary.sessionDurationMinutes).toBeGreaterThanOrEqual(0);
  });
});

describe("Serialization", () => {
  it("should serialize and deserialize state", () => {
    let state = initSessionState();
    state = rejectEntity(state, "John");
    state = approveSource(state, "user/test.md");
    state = recordInjection(state, 100);

    const json = serializeState(state);
    const restored = deserializeState(json);

    expect(restored).not.toBeNull();
    expect(restored!.rejectedEntities).toEqual(state.rejectedEntities);
    expect(restored!.acceptedSources).toEqual(state.acceptedSources);
    expect(restored!.injectionCount).toBe(state.injectionCount);
  });

  it("should return null for invalid JSON", () => {
    expect(deserializeState("not json")).toBeNull();
    expect(deserializeState("{}")).toBeNull();
  });
});

describe("State Reset", () => {
  let state: SessionACRState;

  beforeEach(() => {
    state = initSessionState();
    state = rejectEntity(state, "John");
    state = approveSource(state, "user/test.md");
    state = recordInjection(state, 100);
  });

  describe("resetState", () => {
    it("should return fresh state", () => {
      const newState = resetState();

      expect(newState.rejectedEntities).toEqual([]);
      expect(newState.acceptedSources).toEqual({});
      expect(newState.injectionCount).toBe(0);
    });
  });

  describe("resetRejections", () => {
    it("should clear only rejections", () => {
      const newState = resetRejections(state);

      expect(newState.rejectedEntities).toEqual([]);
      expect(Object.keys(newState.acceptedSources).length).toBeGreaterThan(0);
      expect(newState.injectionCount).toBe(1);
    });
  });

  describe("resetApprovals", () => {
    it("should clear only approvals", () => {
      const newState = resetApprovals(state);

      expect(newState.rejectedEntities).toContain("John");
      expect(newState.acceptedSources).toEqual({});
      expect(newState.injectionCount).toBe(1);
    });
  });
});
