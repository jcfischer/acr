/**
 * ACR Tier 1 - Main Entry Point
 *
 * Fast grep-based entity detection that runs at session start.
 * Extracts entities from context, greps USER/ files, returns scored matches.
 */

import { readdirSync, statSync } from "fs";
import { join, extname } from "path";
import type { EntityMatch, GrepResult, SearchContext } from "./types";
import { createEmptyResult, shouldEscalate } from "./types";
import { extractEntities } from "./entity-extractor";
import { grepFiles } from "./grep-engine";
import { scoreMatches } from "./match-scorer";
import {
  ACR_CONFIG,
  SEARCHABLE_EXTENSIONS,
  EXCLUDED_DIRS,
} from "./config";

// ============================================================================
// T-5.1: Result Aggregator
// ============================================================================

/**
 * Aggregate matches into final GrepResult.
 * Sorts by confidence, calculates aggregate, sets escalation flag.
 */
export function aggregateResults(
  matches: EntityMatch[],
  searchContext: SearchContext,
  latencyMs: number
): GrepResult {
  // Sort by confidence descending
  const sortedMatches = [...matches].sort(
    (a, b) => b.confidence - a.confidence
  );

  // Calculate aggregate confidence (max of all matches)
  const aggregateConfidence =
    sortedMatches.length > 0 ? sortedMatches[0].confidence : 0;

  // Determine if we should escalate to Tier 2
  const escalateToTier2 = shouldEscalate(aggregateConfidence);

  return {
    matches: sortedMatches,
    aggregateConfidence,
    latencyMs,
    escalateToTier2,
    searchContext,
  };
}

// ============================================================================
// T-5.2: Main Entry Point
// ============================================================================

/**
 * Discover searchable files in a directory recursively.
 */
function discoverFiles(
  dirPath: string,
  maxDepth: number = 3,
  currentDepth: number = 0
): string[] {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip excluded directories
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        // Recurse into subdirectories
        const subFiles = discoverFiles(
          join(dirPath, entry.name),
          maxDepth,
          currentDepth + 1
        );
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if file extension is searchable
        const ext = extname(entry.name).toLowerCase();
        if (SEARCHABLE_EXTENSIONS.has(ext)) {
          files.push(join(dirPath, entry.name));
        }
      }
    }
  } catch {
    // Directory doesn't exist or permission error - return empty
  }

  return files;
}

/**
 * Run the full ACR Tier 1 grep pipeline.
 *
 * @param prompt User's prompt/question
 * @param cwd Current working directory (for project name extraction)
 * @param userDir Path to USER/ directory to search (default: ~/.claude/skills/CORE/USER)
 * @param timeout Maximum time for grep operation in ms
 * @returns GrepResult with matches, confidence, and escalation decision
 */
export async function runTier1Grep(
  prompt: string,
  cwd: string,
  userDir: string = join(
    process.env.HOME || "",
    ".claude/skills/CORE/USER"
  ),
  timeout: number = ACR_CONFIG.grepTimeoutMs
): Promise<GrepResult> {
  const startTime = performance.now();

  // Check if ACR is enabled
  if (!ACR_CONFIG.enabled) {
    return createEmptyResult(
      { entities: [], workingDir: cwd, recentFiles: [], rawPrompt: prompt },
      0
    );
  }

  // Extract entities from prompt and context
  const searchContext = extractEntities(prompt, cwd);

  // If no entities found, return early
  if (searchContext.entities.length === 0) {
    const latencyMs = performance.now() - startTime;
    return createEmptyResult(searchContext, latencyMs);
  }

  // Discover files in USER directory
  const files = discoverFiles(userDir);

  // If no files found, return early
  if (files.length === 0) {
    const latencyMs = performance.now() - startTime;
    return createEmptyResult(searchContext, latencyMs);
  }

  // Grep files for entities
  const rawMatches = await grepFiles(files, searchContext.entities);

  // Score matches
  const scoredMatches = scoreMatches(rawMatches);

  // Limit to max matches
  const limitedMatches = scoredMatches.slice(0, ACR_CONFIG.maxMatches);

  // Calculate latency
  const latencyMs = performance.now() - startTime;

  // Aggregate and return
  return aggregateResults(limitedMatches, searchContext, latencyMs);
}

// ============================================================================
// Exports for testing
// ============================================================================

export { discoverFiles };
