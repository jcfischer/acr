/**
 * Tests for ACR Tier 4 - Content Type Classification
 */

import { describe, it, expect } from "bun:test";
import {
  classifyByPath,
  classifyBySourceType,
  classifyContent,
  getHalfLifeForPath,
  getHalfLifeForSourceType,
  isValidContentType,
  parseContentType,
  getContentTypeDescription,
  getContentTypesByHalfLife,
} from "../src/tier4-content-type";
import { HALF_LIFE_DAYS } from "../src/tier4-types";

describe("Tier 4 Content Type Classification", () => {
  describe("classifyByPath", () => {
    describe("identity content", () => {
      it("classifies DAIDENTITY.md", () => {
        expect(classifyByPath("USER/DAIDENTITY.md")).toBe("identity");
        expect(classifyByPath("/path/to/daidentity.md")).toBe("identity");
      });

      it("classifies ALGOPREFS.md", () => {
        expect(classifyByPath("USER/ALGOPREFS.md")).toBe("identity");
      });

      it("classifies preferences files", () => {
        expect(classifyByPath("preferences.md")).toBe("identity");
      });
    });

    describe("contacts content", () => {
      it("classifies contacts directory", () => {
        expect(classifyByPath("USER/CONTACTS/john.md")).toBe("contacts");
        expect(classifyByPath("contacts/jane.md")).toBe("contacts");
      });

      it("classifies people directory", () => {
        expect(classifyByPath("people/colleague.md")).toBe("contacts");
      });
    });

    describe("projects content", () => {
      it("classifies TELOS/PROJECTS.md", () => {
        expect(classifyByPath("TELOS/PROJECTS.md")).toBe("projects");
        expect(classifyByPath("USER/TELOS/projects.md")).toBe("projects");
      });

      it("classifies projects directory", () => {
        expect(classifyByPath("projects/acr.md")).toBe("projects");
      });
    });

    describe("learnings content", () => {
      it("classifies TELOS/LEARNED.md", () => {
        expect(classifyByPath("TELOS/LEARNED.md")).toBe("learnings");
      });

      it("classifies learning files", () => {
        expect(classifyByPath("learnings.md")).toBe("learnings");
        expect(classifyByPath("learning/typescript.md")).toBe("learnings");
      });
    });

    describe("sessions content", () => {
      it("classifies session files", () => {
        expect(classifyByPath("sessions/2024-01-15.json")).toBe("sessions");
        expect(classifyByPath("session/current.md")).toBe("sessions");
      });

      it("classifies synopsis files", () => {
        expect(classifyByPath("synopsis.md")).toBe("sessions");
        expect(classifyByPath("synopses.md")).toBe("sessions");
      });

      it("classifies history files", () => {
        expect(classifyByPath("history.json")).toBe("sessions");
      });
    });

    describe("operational content (default)", () => {
      it("classifies work directory", () => {
        expect(classifyByPath("work/task.md")).toBe("operational");
      });

      it("classifies task files", () => {
        expect(classifyByPath("tasks/current.md")).toBe("operational");
        expect(classifyByPath("todo.md")).toBe("operational");
      });

      it("defaults to operational for unknown USER/ content", () => {
        expect(classifyByPath("USER/random.md")).toBe("operational");
      });

      it("defaults to operational for completely unknown paths", () => {
        expect(classifyByPath("some/random/path.txt")).toBe("operational");
      });
    });
  });

  describe("classifyBySourceType", () => {
    it("classifies user source types", () => {
      expect(classifyBySourceType("user")).toBe("operational");
      expect(classifyBySourceType("user/identity")).toBe("identity");
      expect(classifyBySourceType("user/contacts")).toBe("contacts");
      expect(classifyBySourceType("user/projects")).toBe("projects");
      expect(classifyBySourceType("user/learnings")).toBe("learnings");
    });

    it("classifies session source type", () => {
      expect(classifyBySourceType("session")).toBe("sessions");
    });

    it("classifies tana source type as operational", () => {
      expect(classifyBySourceType("tana")).toBe("operational");
    });

    it("handles case insensitivity", () => {
      expect(classifyBySourceType("USER")).toBe("operational");
      expect(classifyBySourceType("Session")).toBe("sessions");
    });

    it("defaults to operational for unknown types", () => {
      expect(classifyBySourceType("unknown")).toBe("operational");
      expect(classifyBySourceType("")).toBe("operational");
    });
  });

  describe("classifyContent", () => {
    it("prefers path over source type", () => {
      expect(classifyContent("DAIDENTITY.md", "user")).toBe("identity");
      expect(classifyContent("contacts/john.md", "session")).toBe("contacts");
    });

    it("falls back to source type when no path", () => {
      expect(classifyContent(undefined, "session")).toBe("sessions");
      expect(classifyContent(undefined, "user/identity")).toBe("identity");
    });

    it("defaults to operational when neither provided", () => {
      expect(classifyContent()).toBe("operational");
      expect(classifyContent(undefined, undefined)).toBe("operational");
    });
  });

  describe("getHalfLifeForPath", () => {
    it("returns correct half-life for each content type", () => {
      expect(getHalfLifeForPath("DAIDENTITY.md")).toBe(180);
      expect(getHalfLifeForPath("contacts/john.md")).toBe(90);
      expect(getHalfLifeForPath("TELOS/PROJECTS.md")).toBe(60);
      expect(getHalfLifeForPath("TELOS/LEARNED.md")).toBe(45);
      expect(getHalfLifeForPath("sessions/today.md")).toBe(30);
      expect(getHalfLifeForPath("work/task.md")).toBe(14);
    });
  });

  describe("getHalfLifeForSourceType", () => {
    it("returns correct half-life for each source type", () => {
      expect(getHalfLifeForSourceType("user/identity")).toBe(180);
      expect(getHalfLifeForSourceType("user/contacts")).toBe(90);
      expect(getHalfLifeForSourceType("session")).toBe(30);
      expect(getHalfLifeForSourceType("tana")).toBe(14);
    });
  });

  describe("isValidContentType", () => {
    it("returns true for valid types", () => {
      expect(isValidContentType("identity")).toBe(true);
      expect(isValidContentType("contacts")).toBe(true);
      expect(isValidContentType("projects")).toBe(true);
      expect(isValidContentType("learnings")).toBe(true);
      expect(isValidContentType("sessions")).toBe(true);
      expect(isValidContentType("operational")).toBe(true);
    });

    it("returns false for invalid types", () => {
      expect(isValidContentType("invalid")).toBe(false);
      expect(isValidContentType("")).toBe(false);
      expect(isValidContentType("IDENTITY")).toBe(false); // Case sensitive
    });
  });

  describe("parseContentType", () => {
    it("parses valid types", () => {
      expect(parseContentType("identity")).toBe("identity");
      expect(parseContentType("sessions")).toBe("sessions");
    });

    it("returns default for invalid types", () => {
      expect(parseContentType("invalid")).toBe("operational");
      expect(parseContentType("invalid", "sessions")).toBe("sessions");
    });
  });

  describe("getContentTypeDescription", () => {
    it("returns descriptions for all types", () => {
      expect(getContentTypeDescription("identity")).toContain("180-day");
      expect(getContentTypeDescription("contacts")).toContain("90-day");
      expect(getContentTypeDescription("projects")).toContain("60-day");
      expect(getContentTypeDescription("learnings")).toContain("45-day");
      expect(getContentTypeDescription("sessions")).toContain("30-day");
      expect(getContentTypeDescription("operational")).toContain("14-day");
    });
  });

  describe("getContentTypesByHalfLife", () => {
    it("returns types sorted by half-life descending", () => {
      const types = getContentTypesByHalfLife();
      expect(types[0]).toBe("identity"); // 180 days
      expect(types[types.length - 1]).toBe("operational"); // 14 days

      // Verify ordering
      for (let i = 1; i < types.length; i++) {
        expect(HALF_LIFE_DAYS[types[i - 1]]).toBeGreaterThanOrEqual(HALF_LIFE_DAYS[types[i]]);
      }
    });
  });
});
