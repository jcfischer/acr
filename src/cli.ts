#!/usr/bin/env bun
/**
 * ACR CLI - Autonomous Contextual Recall
 *
 * Usage:
 *   acr <prompt>              Run Tier 1 grep search
 *   acr --tier2 <prompt>      Force Tier 2 semantic search
 *   acr --index-maestro       Index Maestro session history
 *   acr --status              Show ACR status and stats
 */

import { runTier1Grep } from "./tier1-grep";
import { runTier2Semantic } from "./tier2-resona";
import { syncMaestroIndex, loadIndexState } from "./maestro-indexer";
import { MAESTRO_CONFIG } from "./maestro-types";

const args = process.argv.slice(2);

async function main() {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
ACR - Autonomous Contextual Recall

Usage:
  acr <prompt>              Search for context matching prompt
  acr --tier2 <prompt>      Force Tier 2 semantic search
  acr --index-maestro       Index Maestro session history
  acr --index-maestro-full  Full reindex of Maestro history
  acr --status              Show index status

Options:
  -h, --help     Show this help
  -v, --version  Show version
  --json         Output as JSON

Examples:
  acr "Daniel's project preferences"
  acr --tier2 "remember that security discussion"
  acr --index-maestro
`);
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log("acr v1.0.0");
    process.exit(0);
  }

  if (args[0] === "--status") {
    const state = await loadIndexState(MAESTRO_CONFIG.stateFile);
    const fileCount = state.indexedFiles ? Object.keys(state.indexedFiles).length : 0;
    const entryCount = state.indexedFiles
      ? Object.values(state.indexedFiles).reduce((sum, f) => sum + (f.entryCount ?? 0), 0)
      : 0;
    console.log("ACR Status");
    console.log("==========");
    console.log(`Maestro entries indexed: ${entryCount}`);
    console.log(`Maestro files tracked: ${fileCount}`);
    console.log(`Last sync: ${state.lastSyncTimestamp ? new Date(state.lastSyncTimestamp).toISOString() : "never"}`);
    process.exit(0);
  }

  if (args[0] === "--index-maestro" || args[0] === "--index-maestro-full") {
    const full = args[0] === "--index-maestro-full";
    console.log(`Indexing Maestro history${full ? " (full reindex)" : ""}...`);
    const result = await syncMaestroIndex(
      MAESTRO_CONFIG.historyDir,
      MAESTRO_CONFIG.stateFile,
      { full }
    );
    console.log(`Indexed ${result.entriesIndexed ?? 0} entries from ${result.filesProcessed ?? 0} files`);
    if (result.errors && result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }
    process.exit(0);
  }

  const forceTier2 = args[0] === "--tier2";
  const jsonOutput = args.includes("--json");
  const promptArgs = args.filter(a => !a.startsWith("--"));
  const prompt = promptArgs.join(" ");

  if (!prompt) {
    console.error("Error: No prompt provided");
    process.exit(1);
  }

  const projectPath = process.cwd();

  // Run Tier 1
  const tier1Result = await runTier1Grep(prompt, projectPath);

  if (jsonOutput) {
    if (forceTier2 || tier1Result.escalateToTier2) {
      const tier2Result = await runTier2Semantic(tier1Result, prompt);
      console.log(JSON.stringify({ tier1: tier1Result, tier2: tier2Result }, null, 2));
    } else {
      console.log(JSON.stringify({ tier1: tier1Result }, null, 2));
    }
    process.exit(0);
  }

  // Human-readable output
  console.log(`\nACR Results for: "${prompt}"`);
  console.log("=".repeat(50));

  if (tier1Result.matches.length > 0) {
    console.log(`\nTier 1 (Grep) - ${tier1Result.matches.length} matches:`);
    for (const match of tier1Result.matches.slice(0, 5)) {
      console.log(`  [${(match.confidence * 100).toFixed(0)}%] ${match.entity} in ${match.source}`);
      if (match.context) {
        console.log(`       "${match.context.substring(0, 80)}..."`);
      }
    }
  }

  if (forceTier2 || tier1Result.escalateToTier2) {
    console.log(`\nTier 2 (Semantic) - escalating...`);
    const tier2Result = await runTier2Semantic(tier1Result, prompt);

    if (tier2Result.results.length > 0) {
      console.log(`Found ${tier2Result.results.length} semantic matches:`);
      for (const result of tier2Result.results.slice(0, 5)) {
        console.log(`  [${(result.confidence * 100).toFixed(0)}%] ${result.source} - ${result.content.substring(0, 60)}...`);
      }
    } else {
      console.log("  No semantic matches found");
    }
  }

  console.log(`\nConfidence: ${(tier1Result.confidence * 100).toFixed(0)}%`);
  console.log(`Escalate to Tier 2: ${tier1Result.escalateToTier2 ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
