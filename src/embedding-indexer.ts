/**
 * Embedding Indexer
 * F-007: Resona Integration
 *
 * Unified function for indexing embeddings from various sources.
 */

import type { EmbeddingService } from "./embedding-service";
import { chunkText, needsChunking } from "./embedding-service";
import type { VectorStore, EmbeddingStoreRecord } from "./vector-store";

/**
 * Input for indexing
 */
export interface IndexableInput {
  sourceId: string;
  content: string;
  source: "maestro" | "memory" | "session";
  metadata: Record<string, unknown>;
  timestamp: number;
}

/**
 * Result of indexing operation
 */
export interface IndexingResult {
  processed: number;
  embedded: number;
  failed: number;
  errors: string[];
}

/**
 * Options for indexing
 */
export interface IndexingOptions {
  batchSize?: number;
  /** Progress callback - receives (current, total, phase) */
  onProgress?: (current: number, total: number, phase: string) => void;
}

/**
 * Expand inputs by chunking large content.
 * Creates multiple inputs from one if content exceeds chunk size.
 */
function expandInputsWithChunking(inputs: IndexableInput[]): IndexableInput[] {
  const expanded: IndexableInput[] = [];

  for (const input of inputs) {
    if (needsChunking(input.content)) {
      const chunks = chunkText(input.content);
      for (let i = 0; i < chunks.length; i++) {
        expanded.push({
          sourceId: `${input.sourceId}:chunk:${i}`,
          content: chunks[i],
          source: input.source,
          metadata: {
            ...input.metadata,
            chunkIndex: i,
            totalChunks: chunks.length,
            originalSourceId: input.sourceId,
          },
          timestamp: input.timestamp,
        });
      }
    } else {
      expanded.push(input);
    }
  }

  return expanded;
}

/**
 * Index embeddings from various sources into the vector store.
 * Automatically chunks large content to fit model context.
 */
export async function indexEmbeddings(
  inputs: IndexableInput[],
  embeddingService: EmbeddingService,
  vectorStore: VectorStore,
  options?: IndexingOptions
): Promise<IndexingResult> {
  if (inputs.length === 0) {
    return { processed: 0, embedded: 0, failed: 0, errors: [] };
  }

  // Expand inputs by chunking large content
  const expandedInputs = expandInputsWithChunking(inputs);

  const batchSize = options?.batchSize ?? 50;
  const onProgress = options?.onProgress;

  let processed = 0;
  let embedded = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < expandedInputs.length; i += batchSize) {
    const batch = expandedInputs.slice(i, i + batchSize);
    const contents = batch.map((input) => input.content);

    // Generate embeddings for batch (with error details)
    const { embeddings, errors: batchErrors } =
      await embeddingService.embedBatchWithErrors(contents);

    // Prepare records for storage
    const records: EmbeddingStoreRecord[] = [];

    for (let j = 0; j < batch.length; j++) {
      const input = batch[j];
      const embedding = embeddings[j];

      processed++;

      if (embedding === null) {
        failed++;
        const reason = batchErrors.get(j) ?? "unknown error";
        errors.push(`${input.sourceId}: ${reason}`);
        continue;
      }

      records.push({
        id: input.sourceId,
        vector: embedding,
        content: input.content,
        source: input.source,
        metadata: JSON.stringify(input.metadata),
        timestamp: input.timestamp,
        created_at: Date.now(),
      });
    }

    // Store records (if any succeeded)
    if (records.length > 0) {
      await vectorStore.upsert(records);
      embedded += records.length;
    }

    // Report progress
    if (onProgress) {
      onProgress(processed, expandedInputs.length, "Embedding");
    }
  }

  return { processed, embedded, failed, errors };
}
