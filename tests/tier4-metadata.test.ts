/**
 * Tests for ACR Tier 4 - Metadata Parsing
 */

import { describe, it, expect } from "bun:test";
import {
  extractFrontmatter,
  parseFrontmatterDate,
  parseTTL,
  extractMetadataSync,
  createDefaultMetadata,
  isPermanent,
  usesDefaultDecay,
  hasExplicitExpiration,
  getExpirationDate,
  isExpired,
} from "../src/tier4-metadata";

describe("Tier 4 Metadata Parsing", () => {
  describe("extractFrontmatter", () => {
    it("extracts valid frontmatter", () => {
      const content = `---
created: 2024-01-15
updated: 2024-01-20
ttl: 30
---

# Document content
`;
      const result = extractFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result?.created).toBe("2024-01-15");
      expect(result?.updated).toBe("2024-01-20");
      expect(result?.ttl).toBe("30");
    });

    it("returns null for no frontmatter", () => {
      const content = "# Just a heading\n\nSome content.";
      expect(extractFrontmatter(content)).toBeNull();
    });

    it("returns null for invalid frontmatter", () => {
      const content = "---\nNot valid yaml without colons\n---";
      expect(extractFrontmatter(content)).toBeNull();
    });

    it("handles multiline values", () => {
      const content = `---
title: My Document
author: Test Author
---
Content`;
      const result = extractFrontmatter(content);
      expect(result?.title).toBe("My Document");
      expect(result?.author).toBe("Test Author");
    });
  });

  describe("parseFrontmatterDate", () => {
    it("parses ISO date strings", () => {
      const date = parseFrontmatterDate("2024-01-15");
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2024);
      expect(date?.getMonth()).toBe(0); // January
      expect(date?.getDate()).toBe(15);
    });

    it("parses ISO datetime strings", () => {
      const date = parseFrontmatterDate("2024-01-15T10:30:00Z");
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2024);
    });

    it("parses Unix timestamps in milliseconds", () => {
      const timestamp = 1705312200000; // 2024-01-15
      const date = parseFrontmatterDate(String(timestamp));
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2024);
    });

    it("parses Unix timestamps in seconds", () => {
      const timestamp = 1705312200; // 2024-01-15
      const date = parseFrontmatterDate(String(timestamp));
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2024);
    });

    it("returns null for invalid dates", () => {
      expect(parseFrontmatterDate("not a date")).toBeNull();
      expect(parseFrontmatterDate("")).toBeNull();
    });
  });

  describe("parseTTL", () => {
    it("parses numeric values", () => {
      expect(parseTTL(30)).toBe(30);
      expect(parseTTL(0)).toBe(0);
      expect(parseTTL(-1)).toBe(-1);
    });

    it("parses numeric strings", () => {
      expect(parseTTL("30")).toBe(30);
      expect(parseTTL("0")).toBe(0);
    });

    it("parses 'permanent' as 0", () => {
      expect(parseTTL("permanent")).toBe(0);
      expect(parseTTL("PERMANENT")).toBe(0);
      expect(parseTTL("never")).toBe(0);
    });

    it("parses 'default' as -1", () => {
      expect(parseTTL("default")).toBe(-1);
      expect(parseTTL("auto")).toBe(-1);
    });

    it("parses day formats", () => {
      expect(parseTTL("30d")).toBe(30);
      expect(parseTTL("30 days")).toBe(30);
      expect(parseTTL("90 day")).toBe(90);
    });

    it("returns undefined for invalid values", () => {
      expect(parseTTL(undefined)).toBeUndefined();
      expect(parseTTL("invalid")).toBeUndefined();
    });
  });

  describe("extractMetadataSync", () => {
    it("extracts from content with frontmatter", () => {
      const content = `---
created: 2024-01-01
updated: 2024-01-15
ttl: 30
---

Content here.`;

      const metadata = extractMetadataSync(content, "sessions/test.md");

      expect(metadata.created.getFullYear()).toBe(2024);
      expect(metadata.updated.getFullYear()).toBe(2024);
      expect(metadata.ttl).toBe(30);
      expect(metadata.contentType).toBe("sessions");
    });

    it("uses reference date when no frontmatter", () => {
      const content = "# No frontmatter\n\nJust content.";
      const referenceDate = new Date("2024-06-01");

      const metadata = extractMetadataSync(content, "work/task.md", referenceDate);

      expect(metadata.created).toEqual(referenceDate);
      expect(metadata.updated).toEqual(referenceDate);
      expect(metadata.ttl).toBeUndefined();
      expect(metadata.contentType).toBe("operational");
    });

    it("classifies content type from path", () => {
      const content = "Content";

      expect(extractMetadataSync(content, "DAIDENTITY.md").contentType).toBe("identity");
      expect(extractMetadataSync(content, "contacts/john.md").contentType).toBe("contacts");
      expect(extractMetadataSync(content, "sessions/today.json").contentType).toBe("sessions");
    });

    it("extracts preserve reason", () => {
      const content = `---
ttl: 0
preserveReason: Critical identity information
---
Content`;

      const metadata = extractMetadataSync(content, "test.md");
      expect(metadata.preserveReason).toBe("Critical identity information");
    });
  });

  describe("createDefaultMetadata", () => {
    it("creates metadata with specified content type", () => {
      const metadata = createDefaultMetadata("contacts");
      expect(metadata.contentType).toBe("contacts");
      expect(metadata.ttl).toBeUndefined();
    });

    it("uses provided reference date", () => {
      const date = new Date("2024-03-01");
      const metadata = createDefaultMetadata("sessions", date);
      expect(metadata.created).toEqual(date);
      expect(metadata.updated).toEqual(date);
    });
  });

  describe("isPermanent", () => {
    it("returns true for TTL=0", () => {
      const metadata = createDefaultMetadata("identity");
      metadata.ttl = 0;
      expect(isPermanent(metadata)).toBe(true);
    });

    it("returns false for other TTL values", () => {
      const metadata = createDefaultMetadata("sessions");
      expect(isPermanent(metadata)).toBe(false);

      metadata.ttl = 30;
      expect(isPermanent(metadata)).toBe(false);

      metadata.ttl = -1;
      expect(isPermanent(metadata)).toBe(false);
    });
  });

  describe("usesDefaultDecay", () => {
    it("returns true when TTL undefined", () => {
      const metadata = createDefaultMetadata("sessions");
      expect(usesDefaultDecay(metadata)).toBe(true);
    });

    it("returns true when TTL=-1", () => {
      const metadata = createDefaultMetadata("sessions");
      metadata.ttl = -1;
      expect(usesDefaultDecay(metadata)).toBe(true);
    });

    it("returns false for explicit TTL", () => {
      const metadata = createDefaultMetadata("sessions");
      metadata.ttl = 30;
      expect(usesDefaultDecay(metadata)).toBe(false);

      metadata.ttl = 0;
      expect(usesDefaultDecay(metadata)).toBe(false);
    });
  });

  describe("hasExplicitExpiration", () => {
    it("returns true for positive TTL", () => {
      const metadata = createDefaultMetadata("sessions");
      metadata.ttl = 30;
      expect(hasExplicitExpiration(metadata)).toBe(true);
    });

    it("returns false for TTL=0, -1, or undefined", () => {
      const metadata = createDefaultMetadata("sessions");
      expect(hasExplicitExpiration(metadata)).toBe(false);

      metadata.ttl = 0;
      expect(hasExplicitExpiration(metadata)).toBe(false);

      metadata.ttl = -1;
      expect(hasExplicitExpiration(metadata)).toBe(false);
    });
  });

  describe("getExpirationDate", () => {
    it("calculates expiration for positive TTL", () => {
      const created = new Date("2024-01-01");
      const metadata = createDefaultMetadata("sessions", created);
      metadata.ttl = 30;

      const expiration = getExpirationDate(metadata);
      expect(expiration).not.toBeNull();
      expect(expiration?.getFullYear()).toBe(2024);
      expect(expiration?.getMonth()).toBe(0); // Still January
      expect(expiration?.getDate()).toBe(31); // Jan 1 + 30 days
    });

    it("returns null for non-expiring content", () => {
      const metadata = createDefaultMetadata("sessions");
      expect(getExpirationDate(metadata)).toBeNull();

      metadata.ttl = 0;
      expect(getExpirationDate(metadata)).toBeNull();

      metadata.ttl = -1;
      expect(getExpirationDate(metadata)).toBeNull();
    });
  });

  describe("isExpired", () => {
    it("returns true when past expiration", () => {
      const created = new Date("2024-01-01");
      const metadata = createDefaultMetadata("sessions", created);
      metadata.ttl = 30;

      const afterExpiration = new Date("2024-02-15"); // 45 days later
      expect(isExpired(metadata, afterExpiration)).toBe(true);
    });

    it("returns false when before expiration", () => {
      const created = new Date("2024-01-01");
      const metadata = createDefaultMetadata("sessions", created);
      metadata.ttl = 30;

      const beforeExpiration = new Date("2024-01-15"); // 14 days later
      expect(isExpired(metadata, beforeExpiration)).toBe(false);
    });

    it("returns false for non-expiring content", () => {
      const metadata = createDefaultMetadata("sessions");
      expect(isExpired(metadata)).toBe(false);

      metadata.ttl = 0;
      expect(isExpired(metadata)).toBe(false);
    });
  });
});
