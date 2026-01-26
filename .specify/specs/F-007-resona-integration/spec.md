# F-007: Resona Integration Completion

## Overview

Complete the ACR Tier 2 semantic search integration with Resona, enabling actual vector embeddings and search for indexed content from Maestro sessions (F-005) and PAI Memory (F-006).

## Problem Statement

Currently, ACR has:
- **Working**: State tracking for Maestro and Memory indexers
- **Working**: Parsing and content extraction pipelines
- **Not Working**: Actual embedding generation and vector storage
- **Not Working**: Search source registration with ResonaAdapter

When users run `acr --tier2 "query"`, they get "No semantic matches found" because:
1. Memory indexer runs with `dryRun: true`
2. No sources are registered with the ResonaAdapter
3. No actual embeddings are stored in the vector database

## Requirements

### R1: Embedding Generation
- Generate embeddings for Maestro session entries
- Generate embeddings for PAI Memory files
- Use Ollama with nomic-embed-text model (Resona default)
- Batch processing to avoid overwhelming Ollama

### R2: Vector Storage
- Store embeddings in LanceDB (Resona's vector store)
- Maintain source metadata for filtering
- Support incremental updates (add/update/delete)

### R3: Search Source Registration
- Register Maestro as searchable source
- Register Memory as searchable source
- Sources should be auto-registered on CLI startup

### R4: CLI Updates
- Remove `dryRun: true` from memory indexer
- Add `--index-all` command to index both sources
- Show embedding counts in `--status`

## Scope

### In Scope
- Resona embedding API integration
- LanceDB vector storage
- Search source registration
- CLI updates for production indexing

### Out of Scope
- Custom embedding models
- Remote vector databases
- Real-time indexing (batch only)
- Tana integration (future feature)

## Technical Context

### Resona Architecture
```
Resona Library
├── EmbeddingService (Ollama integration)
├── VectorStore (LanceDB)
├── SearchSource interface
└── SearchOrchestrator
```

### ACR Integration Points
```
ACR
├── maestro-indexer.ts → Resona EmbeddingService
├── memory-indexer.ts  → Resona EmbeddingService
├── resona-adapter.ts  → Resona SearchOrchestrator
└── cli.ts             → Orchestration
```

### Source ID Formats
- Maestro: `maestro:{fileId}:{entryIndex}`
- Memory: `memory:{LEARNING|DECISION|RESEARCH}:{filename}`

## Acceptance Criteria

### AC1: Embeddings Generated
```bash
acr --index-maestro
# Output: "Indexed 68 entries, generated 68 embeddings"

acr --index-memory
# Output: "Indexed 2126 entries, generated 2126 embeddings"
```

### AC2: Semantic Search Works
```bash
acr --tier2 "voice server"
# Output: Actual semantic matches from indexed content
# NOT: "No semantic matches found"
```

### AC3: Status Shows Embeddings
```bash
acr --status
# Output includes:
#   Maestro embeddings: 68
#   Memory embeddings: 2126
#   Vector DB size: X MB
```

### AC4: Incremental Updates
```bash
# After adding new content to MEMORY/
acr --index-memory
# Output: "Scanned 2127, processed 1, indexed 1" (only new file)
```

## Dependencies

- Resona library (existing dependency)
- Ollama running locally with nomic-embed-text model
- LanceDB (bundled with Resona)

## Risks

| Risk | Mitigation |
|------|------------|
| Ollama not running | Graceful degradation, clear error message |
| Large content batches | Batch size limits, progress reporting |
| LanceDB corruption | Backup state file, rebuild capability |

## Success Metrics

- Tier 2 search returns relevant results
- Indexing completes within 5 minutes for full reindex
- Incremental sync under 1 second when no changes
