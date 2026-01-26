/**
 * Embedding Types and Schemas
 * F-007: Resona Integration
 */

import { z } from "zod/v4";
import { join } from "path";
import { homedir } from "os";

/**
 * Source types that can be embedded
 */
export const EmbeddingSourceSchema = z.enum(["maestro", "memory"]);
export type EmbeddingSource = z.infer<typeof EmbeddingSourceSchema>;

/**
 * Input for embedding generation
 */
export const EmbeddingInputSchema = z.object({
  sourceId: z.string().min(1),
  content: z.string().min(1),
  source: EmbeddingSourceSchema,
  metadata: z.record(z.string(), z.unknown()),
});
export type EmbeddingInput = z.infer<typeof EmbeddingInputSchema>;

/**
 * Record stored in LanceDB vector database
 */
export const EmbeddingRecordSchema = z.object({
  id: z.string(),
  vector: z.instanceof(Float32Array),
  content: z.string(),
  source: z.string(),
  metadata: z.string(), // JSON-encoded
  timestamp: z.number(),
  created_at: z.number(),
});
export type EmbeddingRecord = z.infer<typeof EmbeddingRecordSchema>;

/**
 * Configuration for embedding service
 */
export const EmbeddingConfigSchema = z.object({
  ollamaUrl: z.url(),
  model: z.string().min(1),
  dimensions: z.number().int().positive(),
  batchSize: z.number().int().positive(),
  timeout: z.number().int().positive(),
  dbPath: z.string().min(1),
});
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

/**
 * Default configuration
 */
export const EMBEDDING_CONFIG: EmbeddingConfig = {
  ollamaUrl: "http://localhost:11434",
  model: "bge-m3",
  dimensions: 1024,
  batchSize: 50,
  timeout: 30000,
  dbPath: join(homedir(), ".claude/embeddings/acr.lance"),
};

/**
 * Create default config (returns a copy)
 */
export function createDefaultConfig(): EmbeddingConfig {
  return { ...EMBEDDING_CONFIG };
}

/**
 * Validate and merge partial config with defaults
 */
export function validateConfig(
  partial: Partial<EmbeddingConfig>
): EmbeddingConfig {
  const merged = { ...EMBEDDING_CONFIG, ...partial };
  return EmbeddingConfigSchema.parse(merged);
}
