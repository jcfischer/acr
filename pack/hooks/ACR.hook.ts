#!/Users/fischer/.bun/bin/bun
/**
 * ACR.hook.ts - Autonomous Contextual Recall (UserPromptSubmit)
 *
 * PURPOSE:
 * Retrieves relevant context from MEMORY and codebase based on user's actual
 * prompt. Uses hybrid search: Tier 1 (grep keywords) + Tier 2 (semantic vectors).
 *
 * TRIGGER: UserPromptSubmit
 *
 * INPUT:
 * - stdin: JSON with { prompt: string }
 *
 * OUTPUT:
 * - stdout: <system-reminder> with relevant context matches
 * - stderr: Status/timing information
 * - exit(0): Always (non-blocking)
 *
 * DEPENDENCIES:
 * - ~/bin/acr binary (ACR CLI tool)
 * - ACR_ENABLED env var (set to 'false' to disable)
 *
 * PERFORMANCE:
 * - Non-blocking: Yes (always exits 0)
 * - Typical execution: <2s (with semantic search)
 * - Timeout: 5s max
 *
 * INTER-HOOK RELATIONSHIPS:
 * - COMPLEMENTS: LoadContext.hook.ts (SessionStart ACR for project baseline)
 * - RUNS WITH: Other UserPromptSubmit hooks (SkillEnforcer, FormatReminder, etc.)
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const ACR_BINARY = join(process.env.HOME || '', 'bin/acr');

// Minimum prompt length to trigger ACR (avoid noise on short inputs)
const MIN_PROMPT_LENGTH = 10;

// Maximum query length to pass to ACR (truncate very long prompts)
const MAX_QUERY_LENGTH = 500;

interface ACRMatch {
  entity: string;
  source: string;
  snippet?: string;  // ACR uses 'snippet', not 'context'
}

interface ACRSemanticResult {
  similarity: number;
  source: string;
  sourceId: string;  // Full path info: memory:TYPE:filename
  content?: string;
}

interface ACROutput {
  tier1?: { matches: ACRMatch[] };
  tier2?: { results: ACRSemanticResult[] };
}

/**
 * Extract key terms from prompt for ACR query
 * Removes common words and keeps meaningful terms
 */
function extractQueryTerms(prompt: string): string {
  // Remove common question starters and filler words
  const stopWords = new Set([
    'do', 'you', 'remember', 'where', 'we', 'the', 'a', 'an', 'is', 'are',
    'was', 'were', 'what', 'when', 'how', 'why', 'can', 'could', 'would',
    'should', 'did', 'does', 'have', 'has', 'had', 'been', 'being', 'be',
    'will', 'shall', 'may', 'might', 'must', 'i', 'me', 'my', 'mine',
    'this', 'that', 'these', 'those', 'it', 'its', 'and', 'or', 'but',
    'if', 'then', 'else', 'for', 'to', 'from', 'with', 'about', 'into',
    'please', 'help', 'want', 'need', 'like', 'just', 'also', 'very',
  ]);

  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Keep hyphens for compound words
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Return unique terms, limited length
  const uniqueTerms = [...new Set(words)];
  return uniqueTerms.slice(0, 15).join(' ');
}

async function main() {
  try {
    // Check if ACR is enabled
    if (process.env.ACR_ENABLED === 'false') {
      process.exit(0);
    }

    // Check if ACR binary exists
    if (!existsSync(ACR_BINARY)) {
      console.error('⚠️ ACR: Binary not found at ~/bin/acr');
      process.exit(0);
    }

    // Read prompt from stdin
    const input = await Bun.stdin.text();

    if (!input.trim()) {
      process.exit(0);
    }

    let prompt: string;
    try {
      const parsed = JSON.parse(input);
      prompt = parsed.prompt || '';
    } catch {
      prompt = input.trim();
    }

    if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
      // Skip very short prompts
      process.exit(0);
    }

    // Extract meaningful query terms
    const query = extractQueryTerms(prompt);

    if (query.length < 5) {
      // Not enough meaningful terms
      process.exit(0);
    }

    const startTime = performance.now();

    try {
      // Run ACR with semantic search
      // Escape the query for shell safety
      const safeQuery = query.substring(0, MAX_QUERY_LENGTH).replace(/"/g, '\\"');

      const acrOutput = execSync(`${ACR_BINARY} --tier2 "${safeQuery}" --json`, {
        encoding: 'utf-8',
        timeout: 5000, // 5 second timeout
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const latencyMs = performance.now() - startTime;
      const acrResult: ACROutput = JSON.parse(acrOutput);

      const tier1Matches = acrResult.tier1?.matches || [];
      const tier2Results = acrResult.tier2?.results || [];

      if (tier1Matches.length === 0 && tier2Results.length === 0) {
        console.error(`🔍 ACR: No matches for "${query.slice(0, 40)}..." (${latencyMs.toFixed(0)}ms)`);
        process.exit(0);
      }

      // Format Tier 1 results - show full paths for actionable reading
      const memoryFiles: string[] = [];
      for (const m of tier1Matches.slice(0, 5)) {
        if (m.source && m.source.includes('/.claude/')) {
          memoryFiles.push(m.source);
        }
      }
      const uniqueMemoryFiles = [...new Set(memoryFiles)];

      // Format Tier 2 semantic results - group sessions by project
      const sessionsByProject = new Map<string, { content: string; similarity: number }[]>();
      const memoryResults: { path: string; content: string; similarity: number }[] = [];

      for (const r of tier2Results.slice(0, 10)) {
        const parts = r.sourceId?.split(':') || [];
        if (parts[0] === 'session' && parts[1]) {
          // Session result: session:project-name:session-uuid:turn-uuid
          const projectName = parts[1];
          if (!sessionsByProject.has(projectName)) {
            sessionsByProject.set(projectName, []);
          }
          sessionsByProject.get(projectName)!.push({
            content: (r.content || '').substring(0, 200).replace(/\n/g, ' '),
            similarity: r.similarity,
          });
        } else if (parts[0] === 'memory' && parts.length >= 3) {
          // Memory result: memory:TYPE:filename
          memoryResults.push({
            path: `~/.claude/skills/CORE/${parts[1]}/${parts.slice(2).join(':')}`,
            content: (r.content || '').substring(0, 200).replace(/\n/g, ' '),
            similarity: r.similarity,
          });
        }
      }

      // Build actionable output
      let contextMessage = `ACR Context (${latencyMs.toFixed(0)}ms):`;

      // Actionable memory files from Tier 1
      if (uniqueMemoryFiles.length > 0) {
        contextMessage += `\n\n**Relevant files** (use Read tool for details):`;
        for (const filePath of uniqueMemoryFiles.slice(0, 3)) {
          contextMessage += `\n- ${filePath}`;
        }
      }

      // Memory results from Tier 2
      if (memoryResults.length > 0) {
        contextMessage += `\n\n**Memory matches**:`;
        for (const m of memoryResults.slice(0, 3)) {
          contextMessage += `\n- [${(m.similarity * 100).toFixed(0)}%] ${m.path}: ${m.content}...`;
        }
      }

      // Session context grouped by project
      if (sessionsByProject.size > 0) {
        contextMessage += `\n\n**Previous session context**:`;
        for (const [project, items] of sessionsByProject) {
          const topItems = items.slice(0, 2);
          const avgSimilarity = topItems.reduce((a, b) => a + b.similarity, 0) / topItems.length;
          contextMessage += `\n- ${project} [${(avgSimilarity * 100).toFixed(0)}%]: ${topItems.map(i => i.content).join(' | ')}`;
        }
      }

      // Output as system-reminder
      console.log(`<system-reminder>\n${contextMessage}\n</system-reminder>`);
      console.error(`🔍 ACR: T1=${tier1Matches.length} T2=${tier2Results.length} in ${latencyMs.toFixed(0)}ms`);

    } catch (execError) {
      const latencyMs = performance.now() - startTime;
      console.error(`⚠️ ACR exec failed (${latencyMs.toFixed(0)}ms):`, execError instanceof Error ? execError.message : execError);
    }

    process.exit(0);
  } catch (error) {
    // Non-blocking: always exit 0 even on errors
    console.error('⚠️ ACR hook error:', error);
    process.exit(0);
  }
}

// Only run main if this is the entry point
if (import.meta.main) {
  main();
}
