/**
 * Tests for ACR Tier 3 Ask Pattern Generator
 */

import { describe, it, expect } from "bun:test";
import {
  generateAskPattern,
  generateQuestion,
  generateMultiSourceAskPattern,
  parseAskResponse,
  isAcceptResponse,
  isRejectResponse,
  isPreviewResponse,
  formatSourceForDisplay,
  formatTimeAgo,
  calculateDaysAgo,
  isValidAskPattern,
} from "../src/tier3-ask-pattern";
import type { ContextSource } from "../src/tier3-types";

describe("generateAskPattern", () => {
  const source: ContextSource = {
    content: "John Doe - Security Engineer at Acme Corp. Met at conference.",
    source: "user/contacts/john-doe.md",
    confidence: 0.6,
    tokenCount: 50,
    priority: 90,
    tier: "tier1",
  };

  it("should generate valid ask pattern", () => {
    const pattern = generateAskPattern("John", source, 5);

    expect(pattern.entity).toBe("John");
    expect(pattern.source).toBe("user/contacts/john-doe.md");
    expect(pattern.daysAgo).toBe(5);
    expect(pattern.preview).toBeTruthy();
    expect(pattern.questions).toHaveLength(1);
  });

  it("should have valid question structure", () => {
    const pattern = generateAskPattern("John", source);
    const question = pattern.questions[0];

    expect(question.header).toBe("Context");
    expect(question.header.length).toBeLessThanOrEqual(12);
    expect(question.question).toContain("John");
    expect(question.options).toHaveLength(3);
    expect(question.multiSelect).toBe(false);
  });

  it("should have expected options", () => {
    const pattern = generateAskPattern("John", source);
    const options = pattern.questions[0].options;

    expect(options[0].label).toContain("Yes");
    expect(options[1].label).toContain("No");
    expect(options[2].label).toContain("Show");
  });

  it("should include source info in question", () => {
    const pattern = generateAskPattern("John", source, 3);
    const question = pattern.questions[0].question;

    expect(question).toContain("John");
    expect(question).toContain("Contacts"); // Formatted source
  });

  it("should generate preview from content", () => {
    const pattern = generateAskPattern("John", source);

    expect(pattern.preview).toContain("John Doe");
    expect(pattern.preview).toContain("Security Engineer");
  });
});

describe("generateQuestion", () => {
  it("should include entity name", () => {
    const question = generateQuestion("John", "user/contacts/john.md", 5);

    expect(question).toContain('"John"');
  });

  it("should include formatted source", () => {
    const question = generateQuestion("John", "user/contacts/john.md", 5);

    expect(question).toContain("Contacts");
  });

  it("should include time ago", () => {
    const question = generateQuestion("John", "user/contacts/john.md", 5);

    expect(question).toContain("5 days ago");
  });

  it("should handle 0 days ago as 'recently'", () => {
    const question = generateQuestion("John", "user/contacts/john.md", 0);

    expect(question).toContain("recently");
  });
});

describe("generateMultiSourceAskPattern", () => {
  const sources: ContextSource[] = [
    { content: "Content A", source: "user/contacts/john.md", confidence: 0.6, tokenCount: 30, priority: 90, tier: "tier1" },
    { content: "Content B", source: "session/abc123", confidence: 0.55, tokenCount: 40, priority: 50, tier: "tier2" },
    { content: "Content C", source: "tana/node456", confidence: 0.52, tokenCount: 35, priority: 30, tier: "tier2" },
  ];

  it("should return null for empty sources", () => {
    expect(generateMultiSourceAskPattern("Test", [])).toBeNull();
  });

  it("should generate pattern for multiple sources", () => {
    const pattern = generateMultiSourceAskPattern("John", sources);

    expect(pattern).not.toBeNull();
    expect(pattern!.questions).toHaveLength(1);
  });

  it("should mention count in question", () => {
    const pattern = generateMultiSourceAskPattern("John", sources);
    const question = pattern!.questions[0].question;

    expect(question).toContain("3");
  });

  it("should have multi-source options", () => {
    const pattern = generateMultiSourceAskPattern("John", sources);
    const options = pattern!.questions[0].options;

    expect(options[0].label).toContain("all");
    expect(options[2].label).toContain("choose");
  });

  it("should use first source for primary info", () => {
    const pattern = generateMultiSourceAskPattern("John", sources);

    expect(pattern!.source).toBe("user/contacts/john.md");
  });
});

describe("parseAskResponse", () => {
  it("should parse 'Yes, include it' as include", () => {
    expect(parseAskResponse("Yes, include it")).toBe("include");
  });

  it("should parse 'No, skip it' as skip", () => {
    expect(parseAskResponse("No, skip it")).toBe("skip");
  });

  it("should parse 'Show me first' as preview", () => {
    expect(parseAskResponse("Show me first")).toBe("preview");
  });

  it("should parse 'Let me choose' as choose", () => {
    expect(parseAskResponse("Let me choose")).toBe("choose");
  });

  it("should handle variations", () => {
    expect(parseAskResponse("YES")).toBe("include");
    expect(parseAskResponse("include all")).toBe("include");
    expect(parseAskResponse("skip all")).toBe("skip");
    expect(parseAskResponse("preview")).toBe("preview");
  });

  it("should default to preview for unknown", () => {
    expect(parseAskResponse("something random")).toBe("preview");
  });
});

describe("isAcceptResponse", () => {
  it("should return true for include", () => {
    expect(isAcceptResponse("include")).toBe(true);
  });

  it("should return false for others", () => {
    expect(isAcceptResponse("skip")).toBe(false);
    expect(isAcceptResponse("preview")).toBe(false);
    expect(isAcceptResponse("choose")).toBe(false);
  });
});

describe("isRejectResponse", () => {
  it("should return true for skip", () => {
    expect(isRejectResponse("skip")).toBe(true);
  });

  it("should return false for others", () => {
    expect(isRejectResponse("include")).toBe(false);
    expect(isRejectResponse("preview")).toBe(false);
  });
});

describe("isPreviewResponse", () => {
  it("should return true for preview and choose", () => {
    expect(isPreviewResponse("preview")).toBe(true);
    expect(isPreviewResponse("choose")).toBe(true);
  });

  it("should return false for others", () => {
    expect(isPreviewResponse("include")).toBe(false);
    expect(isPreviewResponse("skip")).toBe(false);
  });
});

describe("formatSourceForDisplay", () => {
  it("should format USER/CONTACTS paths", () => {
    expect(formatSourceForDisplay("user/contacts/john-doe.md")).toBe("Contacts (john-doe)");
    expect(formatSourceForDisplay("USER/CONTACTS/Jane.md")).toBe("Contacts (Jane)");
  });

  it("should format USER/PROJECTS paths", () => {
    expect(formatSourceForDisplay("user/projects/acr.md")).toBe("Projects (acr)");
  });

  it("should format simple USER paths", () => {
    expect(formatSourceForDisplay("user/readme.md")).toBe("User (readme)");
  });

  it("should format session sources", () => {
    expect(formatSourceForDisplay("session/abc123")).toBe("Session History");
    expect(formatSourceForDisplay("sessions/xyz")).toBe("Session History");
  });

  it("should format tana sources", () => {
    expect(formatSourceForDisplay("tana/node123")).toBe("Tana Notes");
  });

  it("should use filename for unknown sources", () => {
    expect(formatSourceForDisplay("/path/to/file.md")).toBe("file");
    expect(formatSourceForDisplay("random/path/doc.txt")).toBe("doc");
  });
});

describe("formatTimeAgo", () => {
  it("should format 0 days as recently", () => {
    expect(formatTimeAgo(0)).toBe(" (recently)");
  });

  it("should format 1 day", () => {
    expect(formatTimeAgo(1)).toBe(" (1 day ago)");
  });

  it("should format multiple days", () => {
    expect(formatTimeAgo(5)).toBe(" (5 days ago)");
  });

  it("should format weeks", () => {
    expect(formatTimeAgo(7)).toBe(" (1 week ago)");
    expect(formatTimeAgo(14)).toBe(" (2 weeks ago)");
  });

  it("should format months", () => {
    expect(formatTimeAgo(30)).toBe(" (1 month ago)");
    expect(formatTimeAgo(60)).toBe(" (2 months ago)");
  });

  it("should format years", () => {
    expect(formatTimeAgo(365)).toBe(" (1 year ago)");
    expect(formatTimeAgo(730)).toBe(" (2 years ago)");
  });
});

describe("calculateDaysAgo", () => {
  it("should calculate days from timestamp", () => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    expect(calculateDaysAgo(oneWeekAgo)).toBe(7);
  });

  it("should return 0 for current time", () => {
    const now = Date.now();

    expect(calculateDaysAgo(now)).toBe(0);
  });

  it("should floor partial days", () => {
    const now = Date.now();
    const halfDayAgo = now - 12 * 60 * 60 * 1000;

    expect(calculateDaysAgo(halfDayAgo)).toBe(0);
  });
});

describe("isValidAskPattern", () => {
  it("should validate correct pattern", () => {
    const pattern = {
      questions: [
        {
          header: "Test",
          question: "Is this valid?",
          options: [
            { label: "Yes", description: "Accept" },
            { label: "No", description: "Reject" },
          ],
          multiSelect: false,
        },
      ],
      entity: "Test",
      source: "test",
      daysAgo: 0,
      preview: "preview",
    };

    expect(isValidAskPattern(pattern)).toBe(true);
  });

  it("should reject pattern without questions", () => {
    const pattern = {
      questions: [],
      entity: "Test",
      source: "test",
      daysAgo: 0,
      preview: "preview",
    };

    expect(isValidAskPattern(pattern)).toBe(false);
  });

  it("should reject pattern with header > 12 chars", () => {
    const pattern = {
      questions: [
        {
          header: "This Is Too Long",
          question: "Test?",
          options: [
            { label: "Yes", description: "Accept" },
            { label: "No", description: "Reject" },
          ],
          multiSelect: false,
        },
      ],
      entity: "Test",
      source: "test",
      daysAgo: 0,
      preview: "preview",
    };

    expect(isValidAskPattern(pattern)).toBe(false);
  });

  it("should reject pattern with < 2 options", () => {
    const pattern = {
      questions: [
        {
          header: "Test",
          question: "Test?",
          options: [{ label: "Only One", description: "Option" }],
          multiSelect: false,
        },
      ],
      entity: "Test",
      source: "test",
      daysAgo: 0,
      preview: "preview",
    };

    expect(isValidAskPattern(pattern)).toBe(false);
  });
});
