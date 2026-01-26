/**
 * ACR Tier 2 - Query Construction
 *
 * Transforms user prompts and context into optimized semantic queries.
 */

import { basename } from "path";
import type { SearchContext, EntityMatch } from "./types";
import type { SemanticQuery } from "./tier2-types";
import { STOPWORDS } from "./config";

// ============================================================================
// T-3.0: Comparison/Recall Pattern Detection
// ============================================================================

/**
 * Patterns that indicate a recall query about comparisons, discussions, etc.
 * These patterns help extract what the user is looking FOR (the answer content)
 * rather than what they're ASKING (the question).
 */
const RECALL_PATTERNS = [
  // "do you remember where we compared X vs Y"
  /(?:remember|recall|find).*(?:compared?|comparison of|versus|vs\.?)\s+(.+?)\s+(?:vs\.?|versus|and|against|with)\s+(.+?)(?:\?|$|\.)/i,
  // "where did we discuss X and Y"
  /(?:where|when).*(?:discuss|talk about|analyze|review)\s+(.+?)\s+(?:and|with|versus|vs\.?)\s+(.+?)(?:\?|$|\.)/i,
  // "what did we decide about X"
  /(?:what|how).*(?:decide|conclude|determine).*(?:about|regarding|for)\s+(.+?)(?:\?|$|\.)/i,
  // "the comparison between X and Y"
  /comparison\s+(?:between|of)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)(?:\?|$|\.)/i,
];

/**
 * Extract comparison/recall subjects from a query.
 *
 * When user asks "do you remember where we compared tana-local vs supertag-cli",
 * this extracts ["tana-local", "supertag-cli"] which should match the actual
 * comparison content better than the question phrasing.
 *
 * @param prompt User's prompt
 * @returns Array of extracted subjects, or empty if no pattern matches
 */
export function extractComparisonSubjects(prompt: string): string[] {
  const subjects: string[] = [];

  for (const pattern of RECALL_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      // Extract captured groups (the subjects being compared/discussed)
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          const subject = match[i].trim();
          // Clean up and add if substantive
          if (subject.length >= 2 && !isStopword(subject)) {
            subjects.push(subject);
          }
        }
      }
      break; // Use first matching pattern
    }
  }

  return subjects;
}

/**
 * Generate an enhanced query focused on the answer content rather than the question.
 *
 * For comparison queries, this generates a query like:
 * "tana-local supertag-cli comparison table analysis"
 *
 * @param prompt Original user prompt
 * @returns Enhanced query string, or null if no enhancement possible
 */
export function generateAnswerFocusedQuery(prompt: string): string | null {
  const subjects = extractComparisonSubjects(prompt);

  if (subjects.length === 0) {
    return null;
  }

  // Build answer-focused query
  // Include subjects plus terms likely to appear in comparison content
  const answerTerms = [
    ...subjects,
    "comparison",
    "versus",
    "advantage",
    "capability",
    "table",
    "analysis",
  ];

  return answerTerms.join(" ");
}

// ============================================================================
// T-3.1: Key Phrase Extraction
// ============================================================================

/**
 * Simple tokenizer that handles camelCase and special chars
 */
function tokenize(text: string): string[] {
  // Split camelCase/PascalCase
  const expanded = text.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Split on non-alphanumeric, keeping alphanumeric sequences
  return expanded
    .split(/[^a-zA-Z0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Check if a word is a stopword (case-insensitive)
 */
function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}

/**
 * Extract key phrases from a prompt for semantic search.
 *
 * Strategies:
 * 1. Extract capitalized words (likely proper nouns/entities)
 * 2. Extract multi-word phrases (noun phrases)
 * 3. Filter out stopwords
 * 4. Preserve technical terms (camelCase, acronyms)
 *
 * @param prompt User's prompt to extract phrases from
 * @param maxPhrases Maximum number of phrases to return (default: 10)
 * @returns Array of key phrases
 */
export function extractKeyPhrases(
  prompt: string,
  maxPhrases: number = 10
): string[] {
  if (!prompt || prompt.trim().length === 0) {
    return [];
  }

  const phrases: string[] = [];
  const seen = new Set<string>();

  // PRIORITY: Extract comparison subjects first (these are most likely what user is looking for)
  const comparisonSubjects = extractComparisonSubjects(prompt);
  for (const subject of comparisonSubjects) {
    const lower = subject.toLowerCase();
    if (!seen.has(lower)) {
      phrases.push(subject);
      seen.add(lower);
    }
  }

  // Extract capitalized words (proper nouns)
  const properNouns = prompt.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
  for (const noun of properNouns) {
    const lower = noun.toLowerCase();
    if (!isStopword(lower) && !seen.has(lower) && noun.length >= 3) {
      phrases.push(noun);
      seen.add(lower);
    }
  }

  // Extract technical terms (camelCase, PascalCase)
  const techTerms = prompt.match(/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g) || [];
  for (const term of techTerms) {
    const lower = term.toLowerCase();
    if (!seen.has(lower)) {
      phrases.push(term);
      seen.add(lower);
    }
  }

  // Extract acronyms (2+ uppercase letters)
  const acronyms = prompt.match(/\b[A-Z]{2,}[0-9]*\b/g) || [];
  for (const acronym of acronyms) {
    const lower = acronym.toLowerCase();
    if (!isStopword(lower) && !seen.has(lower)) {
      phrases.push(acronym);
      seen.add(lower);
    }
  }

  // Extract two-word phrases (simple noun phrase approximation)
  const words = tokenize(prompt);
  for (let i = 0; i < words.length - 1; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];

    // Skip if either is a stopword
    if (isStopword(word1) || isStopword(word2)) continue;

    // Skip if too short
    if (word1.length < 3 || word2.length < 3) continue;

    const phrase = `${word1} ${word2}`;
    const lowerPhrase = phrase.toLowerCase();

    if (!seen.has(lowerPhrase)) {
      phrases.push(phrase);
      seen.add(lowerPhrase);
    }
  }

  // Extract single significant words
  for (const word of words) {
    const lower = word.toLowerCase();
    if (
      !isStopword(lower) &&
      !seen.has(lower) &&
      word.length >= 4 // Slightly longer threshold for single words
    ) {
      phrases.push(word);
      seen.add(lower);
    }
  }

  return phrases.slice(0, maxPhrases);
}

// ============================================================================
// T-3.2: Query Construction
// ============================================================================

/**
 * Temporal hint keywords
 */
const RECENT_KEYWORDS = [
  "recently",
  "last week",
  "yesterday",
  "today",
  "just now",
  "earlier",
  "recent",
  "latest",
];

/**
 * Detect temporal hints in prompt
 */
function detectTemporalHint(prompt: string): "recent" | "any" {
  const lower = prompt.toLowerCase();
  for (const keyword of RECENT_KEYWORDS) {
    if (lower.includes(keyword)) {
      return "recent";
    }
  }
  return "any";
}

/**
 * Extract project name from working directory path
 */
function extractProjectName(workingDir: string): string {
  return basename(workingDir) || "unknown";
}

/**
 * Construct a semantic query from prompt and context.
 *
 * @param prompt User's prompt
 * @param context Search context from Tier 1
 * @param tier1Matches Optional entity matches from Tier 1
 * @returns SemanticQuery for Resona search
 */
export function constructSemanticQuery(
  prompt: string,
  context: SearchContext,
  tier1Matches: EntityMatch[] = []
): SemanticQuery {
  // Extract key phrases from prompt
  const keyPhrases = extractKeyPhrases(prompt);

  // Add Tier 1 entities to expand query
  const tier1Entities = tier1Matches
    .map((m) => m.entity)
    .filter((e) => e.length >= 3);

  // Combine phrases and entities, deduplicate
  const seen = new Set<string>();
  const allPhrases: string[] = [];

  for (const phrase of [...keyPhrases, ...tier1Entities]) {
    const lower = phrase.toLowerCase();
    if (!seen.has(lower)) {
      allPhrases.push(phrase);
      seen.add(lower);
    }
  }

  // Build query text
  // If no phrases extracted, use the original prompt
  const queryText =
    allPhrases.length > 0 ? allPhrases.join(" ") : prompt.slice(0, 200);

  return {
    queryText,
    projectContext: extractProjectName(context.workingDir),
    temporalHint: detectTemporalHint(prompt),
  };
}
