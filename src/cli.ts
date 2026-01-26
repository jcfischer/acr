#!/usr/bin/env bun
/**
 * ACR CLI - Autonomous Contextual Recall
 *
 * Usage:
 *   acr <prompt>              Run Tier 1 grep search
 *   acr --tier2 <prompt>      Force Tier 2 semantic search
 *   acr --index-maestro       Index Maestro session history
 *   acr --index-memory        Index PAI MEMORY directory
 *   acr --status              Show ACR status and stats
 */

import { runTier1Grep } from "./tier1-grep";
import { runTier2Semantic } from "./tier2-resona";
import { syncMaestroIndex, loadIndexState } from "./maestro-indexer";
import { MAESTRO_CONFIG } from "./maestro-types";
import { syncMemoryIndex, loadIndexState as loadMemoryIndexState } from "./memory-indexer";
import { MEMORY_CONFIG } from "./memory-types";
import { syncSessionIndex, loadIndexState as loadSessionIndexState } from "./session-indexer";
import { SESSION_CONFIG } from "./session-types";
import { VectorStore } from "./vector-store";
import { EMBEDDING_CONFIG } from "./embedding-types";
import { formatProgressBar } from "./progress";

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
  acr --index-memory        Index PAI MEMORY directory
  acr --index-memory-full   Full reindex of PAI MEMORY
  acr --index-sessions      Index Claude Code session transcripts
  acr --index-sessions-full Full reindex of session transcripts
  acr --index-all           Index all sources (Maestro + Memory + Sessions)
  acr --index-all-full      Full reindex of all sources
  acr --status              Show index status

Options:
  -h, --help     Show this help
  -v, --version  Show version
  --json         Output as JSON

Examples:
  acr "Daniel's project preferences"
  acr --tier2 "remember that security discussion"
  acr --index-maestro
  acr --index-memory
  acr --index-all
`);
    process.exit(0);
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log("acr v1.0.0");
    process.exit(0);
  }

  if (args[0] === "--status") {
    const maestroState = await loadIndexState(MAESTRO_CONFIG.stateFile);
    const maestroFileCount = maestroState.indexedFiles ? Object.keys(maestroState.indexedFiles).length : 0;
    const maestroEntryCount = maestroState.indexedFiles
      ? Object.values(maestroState.indexedFiles).reduce((sum, f) => sum + (f.entryCount ?? 0), 0)
      : 0;

    const memoryState = await loadMemoryIndexState(MEMORY_CONFIG.stateFile);
    const memoryFileCount = memoryState.indexedFiles ? Object.keys(memoryState.indexedFiles).length : 0;

    // Get embedding stats
    let embeddingStats = { count: 0, sources: {} as Record<string, number> };
    try {
      const vectorStore = new VectorStore(EMBEDDING_CONFIG.dbPath);
      await vectorStore.initialize();
      embeddingStats = await vectorStore.getTableStats();
    } catch {
      // Vector store may not exist yet
    }

    console.log("ACR Status");
    console.log("==========");
    console.log("\nMaestro Sessions:");
    console.log(`  Entries indexed: ${maestroEntryCount}`);
    console.log(`  Files tracked: ${maestroFileCount}`);
    console.log(`  Last sync: ${maestroState.lastSyncTimestamp ? new Date(maestroState.lastSyncTimestamp).toISOString() : "never"}`);
    console.log("\nPAI Memory:");
    console.log(`  Files indexed: ${memoryFileCount}`);
    console.log(`  Last sync: ${memoryState.lastSyncTimestamp ? new Date(memoryState.lastSyncTimestamp).toISOString() : "never"}`);

    const sessionState = await loadSessionIndexState(SESSION_CONFIG.stateFile);
    const sessionCount = sessionState.indexedSessions ? Object.keys(sessionState.indexedSessions).length : 0;
    const sessionTurnCount = sessionState.indexedSessions
      ? Object.values(sessionState.indexedSessions).reduce((sum, s) => sum + (s.turnCount ?? 0), 0)
      : 0;

    console.log("\nClaude Sessions:");
    console.log(`  Sessions indexed: ${sessionCount}`);
    console.log(`  Turns indexed: ${sessionTurnCount}`);
    console.log(`  Last sync: ${sessionState.lastSyncTimestamp ? new Date(sessionState.lastSyncTimestamp).toISOString() : "never"}`);
    console.log("\nVector Embeddings:");
    console.log(`  Total embeddings: ${embeddingStats.count}`);
    if (embeddingStats.sources.maestro) {
      console.log(`  Maestro: ${embeddingStats.sources.maestro}`);
    }
    if (embeddingStats.sources.memory) {
      console.log(`  Memory: ${embeddingStats.sources.memory}`);
    }
    if (embeddingStats.sources.session) {
      console.log(`  Sessions: ${embeddingStats.sources.session}`);
    }
    process.exit(0);
  }

  if (args[0] === "--index-maestro" || args[0] === "--index-maestro-full") {
    const full = args[0] === "--index-maestro-full";
    console.log(`Indexing Maestro history${full ? " (full reindex)" : ""}...`);

    let lastLine = "";
    const clearLine = () => {
      if (lastLine) {
        process.stdout.write("\r" + " ".repeat(lastLine.length) + "\r");
      }
    };

    const result = await syncMaestroIndex(
      MAESTRO_CONFIG.historyDir,
      MAESTRO_CONFIG.stateFile,
      {
        fullReindex: full,
        onProgress: (current, total, phase) => {
          clearLine();
          const bar = formatProgressBar(current, total, { label: `${phase}: `, width: 30 });
          process.stdout.write(bar);
          lastLine = bar;
        },
      }
    );

    clearLine();
    console.log(`Indexed ${result.entriesIndexed ?? 0} entries from ${result.filesProcessed ?? 0} files`);
    console.log(`Embedded: ${result.entriesEmbedded ?? 0}, Errors: ${result.embeddingErrors ?? 0}`);
    if (result.errors && result.errors.length > 0) {
      console.log("\nSample errors:");
      for (const err of result.errors.slice(0, 5)) {
        console.log(`  - ${err}`);
      }
    }
    process.exit(0);
  }

  if (args[0] === "--index-memory" || args[0] === "--index-memory-full") {
    const full = args[0] === "--index-memory-full";
    console.log(`Indexing PAI MEMORY${full ? " (full reindex)" : ""}...`);

    let lastLine = "";
    const clearLine = () => {
      if (lastLine) {
        process.stdout.write("\r" + " ".repeat(lastLine.length) + "\r");
      }
    };

    const result = await syncMemoryIndex({
      baseDir: MEMORY_CONFIG.baseDir,
      directories: MEMORY_CONFIG.directories,
      stateFile: MEMORY_CONFIG.stateFile,
      minContentLength: MEMORY_CONFIG.minContentLength,
      batchSize: MEMORY_CONFIG.batchSize,
      fileExtensions: MEMORY_CONFIG.fileExtensions,
      fullReindex: full,
      onProgress: (current, total, phase) => {
        clearLine();
        const bar = formatProgressBar(current, total, { label: `${phase}: `, width: 30 });
        process.stdout.write(bar);
        lastLine = bar;
      },
    });

    clearLine();
    console.log(`Scanned ${result.filesScanned} files, processed ${result.filesProcessed}, indexed ${result.entriesIndexed} entries`);
    console.log(`Embedded: ${result.entriesEmbedded ?? 0}, Errors: ${result.embeddingErrors ?? 0}`);
    if (result.errors && result.errors.length > 0) {
      console.log("\nSample errors:");
      for (const err of result.errors.slice(0, 5)) {
        console.log(`  - ${err}`);
      }
    }
    process.exit(0);
  }

  if (args[0] === "--index-sessions" || args[0] === "--index-sessions-full") {
    const full = args[0] === "--index-sessions-full";
    console.log(`Indexing Claude Code sessions${full ? " (full reindex)" : ""}...`);

    let lastLine = "";
    const clearLine = () => {
      if (lastLine) {
        process.stdout.write("\r" + " ".repeat(lastLine.length) + "\r");
      }
    };

    const result = await syncSessionIndex({
      fullReindex: full,
      onProgress: (current, total, phase) => {
        clearLine();
        const bar = formatProgressBar(current, total, { label: `${phase}: `, width: 30 });
        process.stdout.write(bar);
        lastLine = bar;
      },
    });

    clearLine();
    console.log(`Scanned ${result.sessionsScanned} sessions, processed ${result.sessionsProcessed}, indexed ${result.turnsIndexed} turns`);
    console.log(`Embedded: ${result.turnsEmbedded ?? 0}, Errors: ${result.embeddingErrors ?? 0}`);
    if (result.errors && result.errors.length > 0) {
      console.log("\nSample errors:");
      for (const err of result.errors.slice(0, 5)) {
        console.log(`  - ${err}`);
      }
    }
    process.exit(0);
  }

  if (args[0] === "--index-all" || args[0] === "--index-all-full") {
    const full = args[0] === "--index-all-full";
    console.log(`Indexing all sources${full ? " (full reindex)" : ""}...\n`);

    let lastLine = "";
    const clearLine = () => {
      if (lastLine) {
        process.stdout.write("\r" + " ".repeat(lastLine.length) + "\r");
      }
    };

    // Index Maestro
    console.log("1. Maestro Sessions:");
    const maestroResult = await syncMaestroIndex(
      MAESTRO_CONFIG.historyDir,
      MAESTRO_CONFIG.stateFile,
      {
        fullReindex: full,
        onProgress: (current, total, phase) => {
          clearLine();
          const bar = formatProgressBar(current, total, { label: `   ${phase}: `, width: 30 });
          process.stdout.write(bar);
          lastLine = bar;
        },
      }
    );
    clearLine();
    console.log(`   Indexed ${maestroResult.entriesIndexed ?? 0} entries from ${maestroResult.filesProcessed ?? 0} files`);
    console.log(`   Embedded: ${maestroResult.entriesEmbedded ?? 0}, Errors: ${maestroResult.embeddingErrors ?? 0}`);

    // Index Memory
    console.log("\n2. PAI Memory:");
    const memoryResult = await syncMemoryIndex({
      baseDir: MEMORY_CONFIG.baseDir,
      directories: MEMORY_CONFIG.directories,
      stateFile: MEMORY_CONFIG.stateFile,
      minContentLength: MEMORY_CONFIG.minContentLength,
      batchSize: MEMORY_CONFIG.batchSize,
      fileExtensions: MEMORY_CONFIG.fileExtensions,
      fullReindex: full,
      onProgress: (current, total, phase) => {
        clearLine();
        const bar = formatProgressBar(current, total, { label: `   ${phase}: `, width: 30 });
        process.stdout.write(bar);
        lastLine = bar;
      },
    });
    clearLine();
    console.log(`   Scanned ${memoryResult.filesScanned} files, processed ${memoryResult.filesProcessed}`);
    console.log(`   Embedded: ${memoryResult.entriesEmbedded ?? 0}, Errors: ${memoryResult.embeddingErrors ?? 0}`);

    // Index Sessions
    console.log("\n3. Claude Sessions:");
    const sessionResult = await syncSessionIndex({
      fullReindex: full,
      onProgress: (current, total, phase) => {
        clearLine();
        const bar = formatProgressBar(current, total, { label: `   ${phase}: `, width: 30 });
        process.stdout.write(bar);
        lastLine = bar;
      },
    });
    clearLine();
    console.log(`   Scanned ${sessionResult.sessionsScanned} sessions, processed ${sessionResult.sessionsProcessed}`);
    console.log(`   Embedded: ${sessionResult.turnsEmbedded ?? 0}, Errors: ${sessionResult.embeddingErrors ?? 0}`);

    // Summary
    const totalEmbedded = (maestroResult.entriesEmbedded ?? 0) + (memoryResult.entriesEmbedded ?? 0) + (sessionResult.turnsEmbedded ?? 0);
    const totalErrors = (maestroResult.embeddingErrors ?? 0) + (memoryResult.embeddingErrors ?? 0) + (sessionResult.embeddingErrors ?? 0);
    console.log(`\nTotal: ${totalEmbedded} embeddings created, ${totalErrors} errors`);

    // Show sample errors if any
    const allErrors = [...(memoryResult.errors ?? []), ...(sessionResult.errors ?? [])];
    if (allErrors.length > 0) {
      console.log("\nSample errors:");
      for (const err of allErrors.slice(0, 5)) {
        console.log(`  - ${err}`);
      }
      if (allErrors.length > 5) {
        console.log(`  ... and ${allErrors.length - 5} more`);
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
      const tier2Result = await runTier2Semantic(tier1Result, prompt, {
        forceActivation: forceTier2,
      });
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
    const tier2Result = await runTier2Semantic(tier1Result, prompt, {
      forceActivation: forceTier2,
    });

    if (tier2Result.results.length > 0) {
      console.log(`Found ${tier2Result.results.length} semantic matches:`);
      for (const result of tier2Result.results.slice(0, 5)) {
        console.log(`  [${(result.similarity * 100).toFixed(0)}%] ${result.source} - ${result.content.substring(0, 60)}...`);
      }
    } else {
      console.log("  No semantic matches found");
    }
  }

  console.log(`\nConfidence: ${(tier1Result.aggregateConfidence * 100).toFixed(0)}%`);
  console.log(`Escalate to Tier 2: ${tier1Result.escalateToTier2 ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
