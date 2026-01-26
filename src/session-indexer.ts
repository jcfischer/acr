/**
 * ACR Tier 2 - Session Indexer
 *
 * Parses Claude session history (.jsonl files) and extracts synopses
 * for semantic indexing.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed entry from session JSONL
 */
export interface SessionEntry {
  type: "summary" | "user" | "assistant" | "tool_use" | "tool_result" | string;
  message?: string;
  summary?: {
    conversation_summary?: string;
    project?: string;
  };
  [key: string]: unknown;
}

/**
 * Extracted session synopsis for indexing
 */
export interface SessionSynopsis {
  /** Unique session identifier */
  sessionId: string;
  /** Project path where session occurred */
  projectPath: string;
  /** Summary/synopsis text for embedding */
  synopsis: string;
  /** When the session was created */
  createdAt: Date;
  /** Number of messages in the session */
  messageCount: number;
}

// ============================================================================
// T-5.1: Session History Parser
// ============================================================================

/**
 * Parse session history JSONL content into entries.
 *
 * @param jsonlContent Raw JSONL file content
 * @returns Array of parsed entries (invalid lines skipped)
 */
export function parseSessionHistory(jsonlContent: string): SessionEntry[] {
  if (!jsonlContent || jsonlContent.trim().length === 0) {
    return [];
  }

  const lines = jsonlContent.split("\n").filter((line) => line.trim().length > 0);
  const entries: SessionEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as SessionEntry;
      entries.push(entry);
    } catch {
      // Skip invalid JSON lines
      continue;
    }
  }

  return entries;
}

// ============================================================================
// T-5.2: Synopsis Extraction
// ============================================================================

/**
 * Maximum length for synopsis text (will be truncated if longer)
 */
const MAX_SYNOPSIS_LENGTH = 500;

/**
 * Extract a synopsis from session entries.
 *
 * Strategy:
 * 1. Look for summary entries with conversation_summary
 * 2. Use the last (most recent) summary if multiple exist
 * 3. Fall back to first user message if no summary
 * 4. Return null if no usable content
 *
 * @param entries Parsed session entries
 * @param sessionId Session identifier
 * @param projectPath Project path
 * @returns SessionSynopsis or null if no usable content
 */
export function extractSynopsis(
  entries: SessionEntry[],
  sessionId: string,
  projectPath: string
): SessionSynopsis | null {
  if (entries.length === 0) {
    return null;
  }

  // Count messages (user + assistant)
  const messageCount = entries.filter(
    (e) => e.type === "user" || e.type === "assistant"
  ).length;

  // Look for summary entries (use last one)
  const summaries = entries.filter(
    (e) => e.type === "summary" && e.summary?.conversation_summary
  );

  let synopsis: string | null = null;

  if (summaries.length > 0) {
    // Use the last summary
    const lastSummary = summaries[summaries.length - 1];
    synopsis = lastSummary.summary?.conversation_summary || null;
  }

  // Fall back to first user message
  if (!synopsis) {
    const firstUserMessage = entries.find((e) => e.type === "user" && e.message);
    if (firstUserMessage?.message) {
      synopsis = firstUserMessage.message;
    }
  }

  if (!synopsis) {
    return null;
  }

  // Truncate if too long
  if (synopsis.length > MAX_SYNOPSIS_LENGTH) {
    synopsis = synopsis.slice(0, MAX_SYNOPSIS_LENGTH);
  }

  return {
    sessionId,
    projectPath,
    synopsis,
    createdAt: new Date(),
    messageCount,
  };
}

// ============================================================================
// File Discovery (for future use)
// ============================================================================

/**
 * Discover session JSONL files in a directory.
 *
 * @param projectsDir Base directory (e.g., ~/.claude/projects)
 * @returns Array of file paths
 */
export async function discoverSessionFiles(
  projectsDir: string
): Promise<string[]> {
  const { readdir } = await import("fs/promises");
  const { join } = await import("path");

  const files: string[] = [];

  try {
    const projects = await readdir(projectsDir, { withFileTypes: true });

    for (const project of projects) {
      if (project.isDirectory()) {
        const projectPath = join(projectsDir, project.name);
        try {
          const projectFiles = await readdir(projectPath);
          for (const file of projectFiles) {
            if (file.endsWith(".jsonl")) {
              files.push(join(projectPath, file));
            }
          }
        } catch {
          // Skip unreadable directories
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}
