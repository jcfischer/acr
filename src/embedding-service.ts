/**
 * Embedding Service
 * F-007: Resona Integration
 *
 * Generates embeddings using Ollama's embedding API.
 */

import {
  type EmbeddingConfig,
  EMBEDDING_CONFIG,
  validateConfig,
} from "./embedding-types";

export type EmbeddingServiceConfig = Partial<EmbeddingConfig>;

// Chunking configuration for large documents
// bge-m3 supports ~8192 tokens, ~4 chars/token average = ~32k chars
// Using conservative 8000 chars per chunk with 500 char overlap
export const CHUNK_CONFIG = {
  maxChunkSize: 8000,
  overlapSize: 500,
  minChunkSize: 100, // Don't create tiny trailing chunks
} as const;

// Maximum characters to send to the embedding model (single chunk)
const MAX_TEXT_LENGTH = CHUNK_CONFIG.maxChunkSize;

export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config?: EmbeddingServiceConfig) {
    this.config = config ? validateConfig(config) : { ...EMBEDDING_CONFIG };
  }

  /**
   * Get the current configuration (returns a copy)
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Check if Ollama is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate embedding for a single text
   * Returns null on failure (never throws)
   */
  async embed(text: string): Promise<Float32Array | null> {
    return (await this.embedWithError(text)).embedding;
  }

  /**
   * Generate embedding with error details
   * Returns { embedding, error } - embedding is null if failed
   */
  async embedWithError(
    text: string
  ): Promise<{ embedding: Float32Array | null; error?: string }> {
    const processed = this.preprocessText(text);
    if (!processed) {
      return { embedding: null, error: "empty or whitespace content" };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      try {
        const response = await fetch(
          `${this.config.ollamaUrl}/api/embeddings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: this.config.model,
              prompt: processed,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "unknown");
          return {
            embedding: null,
            error: `API error ${response.status}: ${errorText.slice(0, 100)}`,
          };
        }

        const data = await response.json();
        if (!data.embedding || !Array.isArray(data.embedding)) {
          return { embedding: null, error: "invalid response format" };
        }

        return { embedding: new Float32Array(data.embedding) };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { embedding: null, error: `request failed: ${msg.slice(0, 100)}` };
    }
  }

  /**
   * Generate embeddings for multiple texts
   * Returns array with null for failed items (maintains order)
   */
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    const result = await this.embedBatchWithErrors(texts);
    return result.embeddings;
  }

  /**
   * Generate embeddings with error details for each item
   */
  async embedBatchWithErrors(texts: string[]): Promise<{
    embeddings: (Float32Array | null)[];
    errors: Map<number, string>;
  }> {
    if (texts.length === 0) {
      return { embeddings: [], errors: new Map() };
    }

    const results: (Float32Array | null)[] = new Array(texts.length).fill(null);
    const errors = new Map<number, string>();
    const validIndices: number[] = [];

    // Pre-process and identify valid texts
    for (let i = 0; i < texts.length; i++) {
      const processed = this.preprocessText(texts[i]);
      if (processed) {
        validIndices.push(i);
      } else {
        errors.set(i, "empty or whitespace content");
      }
    }

    // Process valid texts in batches
    for (let i = 0; i < validIndices.length; i += this.config.batchSize) {
      const batchIndices = validIndices.slice(i, i + this.config.batchSize);

      // Ollama API embeds one at a time, process concurrently within batch
      const batchPromises = batchIndices.map(async (originalIndex) => {
        const { embedding, error } = await this.embedWithError(
          texts[originalIndex]
        );
        results[originalIndex] = embedding;
        if (error) {
          errors.set(originalIndex, error);
        }
      });

      await Promise.all(batchPromises);
    }

    return { embeddings: results, errors };
  }

  /**
   * Preprocess text for embedding
   * Returns null if text is invalid (empty/whitespace)
   */
  private preprocessText(text: string): string | null {
    if (!text) {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    // Truncate if too long
    if (trimmed.length > MAX_TEXT_LENGTH) {
      return trimmed.slice(0, MAX_TEXT_LENGTH);
    }

    return trimmed;
  }
}

/**
 * Chunk text into smaller pieces for embedding.
 * Uses overlap to maintain context continuity between chunks.
 *
 * @param text - Text to chunk
 * @param maxSize - Maximum chunk size (default: CHUNK_CONFIG.maxChunkSize)
 * @param overlap - Overlap between chunks (default: CHUNK_CONFIG.overlapSize)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  maxSize = CHUNK_CONFIG.maxChunkSize,
  overlap = CHUNK_CONFIG.overlapSize
): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // If text fits in one chunk, return as-is
  if (trimmed.length <= maxSize) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = start + maxSize;

    // If this isn't the last chunk, try to break at a natural boundary
    if (end < trimmed.length) {
      // Look for paragraph break first (double newline)
      const paragraphBreak = trimmed.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + maxSize / 2) {
        end = paragraphBreak + 2; // Include the newlines
      } else {
        // Fall back to sentence break (. followed by space or newline)
        const sentenceBreak = Math.max(
          trimmed.lastIndexOf(". ", end),
          trimmed.lastIndexOf(".\n", end)
        );
        if (sentenceBreak > start + maxSize / 2) {
          end = sentenceBreak + 1; // Include the period
        } else {
          // Fall back to word break
          const wordBreak = trimmed.lastIndexOf(" ", end);
          if (wordBreak > start + maxSize / 2) {
            end = wordBreak;
          }
          // Otherwise just cut at maxSize
        }
      }
    } else {
      end = trimmed.length;
    }

    const chunk = trimmed.slice(start, end).trim();

    // Only add chunk if it meets minimum size (unless it's the only chunk)
    if (chunk.length >= CHUNK_CONFIG.minChunkSize || chunks.length === 0) {
      chunks.push(chunk);
    } else if (chunks.length > 0) {
      // Append tiny trailing chunk to previous
      chunks[chunks.length - 1] += " " + chunk;
    }

    // Move start forward, accounting for overlap
    // Ensure we always make forward progress
    const nextStart = end - overlap;
    if (nextStart <= start) {
      // If overlap would cause us to go backwards or stay put, just move to end
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}

/**
 * Check if text needs chunking
 */
export function needsChunking(text: string): boolean {
  return text.trim().length > CHUNK_CONFIG.maxChunkSize;
}
