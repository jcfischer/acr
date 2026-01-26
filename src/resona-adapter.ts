/**
 * ACR Tier 2 - Resona Integration Adapter
 *
 * Abstracts Resona library for ACR-specific usage.
 * Provides graceful degradation when Resona/Ollama unavailable.
 */

import type { UnifiedResult, SourceType } from "./tier2-types";
import { TIER2_CONFIG } from "./tier2-config";
import { EmbeddingService } from "./embedding-service";
import { VectorStore, type SearchFilter, type SearchResult as VectorSearchResult } from "./vector-store";
import { EMBEDDING_CONFIG } from "./embedding-types";

// ============================================================================
// Types
// ============================================================================

/**
 * Source statistics from Resona
 */
export interface SourceStats {
  totalDocuments: number;
  sources: Partial<Record<SourceType, number>>;
}

/**
 * Search source interface (compatible with Resona's SearchSource)
 */
export interface SearchSource {
  sourceId: string;
  description?: string;
  search: (query: string, k: number) => Promise<SearchResult[]>;
  getItem?: (id: string) => Promise<{ preview: string; url?: string } | null>;
}

/**
 * Raw search result from a source
 */
export interface SearchResult {
  id: string;
  similarity: number;
  contextText?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Adapter configuration
 */
export interface ResonaAdapterConfig {
  embeddingDbPath?: string;
  enabled?: boolean;
}

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  limit?: number;
  source?: "maestro" | "memory";
}

// ============================================================================
// ResonaAdapter Class
// ============================================================================

/**
 * Adapter for Resona embedding and search services.
 *
 * Provides:
 * - Unified search across registered sources
 * - Source registration/unregistration
 * - Health checks with graceful degradation
 * - Source statistics
 */
export class ResonaAdapter {
  private sources: Map<string, SearchSource> = new Map();
  private config: ResonaAdapterConfig;
  private initialized: boolean = false;
  private embeddingService: EmbeddingService | null = null;
  private vectorStore: VectorStore | null = null;

  constructor(config: ResonaAdapterConfig = {}) {
    this.config = {
      embeddingDbPath:
        config.embeddingDbPath || TIER2_CONFIG.embeddingDbPath,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Initialize embedding service and vector store.
   * Must be called before using vector search methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.embeddingService = new EmbeddingService();
    this.vectorStore = new VectorStore(
      this.config.embeddingDbPath || EMBEDDING_CONFIG.dbPath
    );
    await this.vectorStore.initialize();
    this.initialized = true;
  }

  /**
   * Search using vector embeddings.
   *
   * @param query Search query text
   * @param options Search options (limit, source filter)
   * @returns Array of UnifiedResult
   */
  async searchVector(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<UnifiedResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Initialize if needed
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.embeddingService || !this.vectorStore) {
      return [];
    }

    try {
      // Generate embedding for query
      const queryVector = await this.embeddingService.embed(query);
      if (!queryVector) {
        return [];
      }

      // Build filter
      const filter: SearchFilter | undefined = options.source
        ? { source: options.source }
        : undefined;

      // Search vector store
      const results = await this.vectorStore.search(
        queryVector,
        options.limit || 10,
        filter
      );

      // Convert to UnifiedResult
      return results.map((r) => this.vectorResultToUnified(r));
    } catch (error) {
      console.error("[ACR Tier2] Vector search failed:", error);
      return [];
    }
  }

  /**
   * Search across all registered sources AND the vector store.
   *
   * @param query Search query text
   * @param limit Maximum results to return
   * @returns Array of UnifiedResult, empty on error
   */
  async searchUnified(query: string, limit: number): Promise<UnifiedResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      const allResults: UnifiedResult[] = [];

      // Search all registered sources in parallel
      const searchPromises = Array.from(this.sources.entries()).map(
        async ([sourceId, source]) => {
          try {
            const results = await source.search(query, limit);
            return results.map((r) => this.toUnifiedResult(r, sourceId));
          } catch (error) {
            console.warn(
              `[ACR Tier2] Source ${sourceId} search failed:`,
              error
            );
            return [];
          }
        }
      );

      const resultsPerSource = await Promise.all(searchPromises);
      for (const results of resultsPerSource) {
        allResults.push(...results);
      }

      // Also search the vector store for embeddings
      try {
        const vectorResults = await this.searchVector(query, { limit });
        allResults.push(...vectorResults);
      } catch (error) {
        // Vector search is optional, log but don't fail
        console.warn("[ACR Tier2] Vector search failed:", error);
      }

      // Sort by similarity descending and limit
      return allResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error("[ACR Tier2] Unified search failed:", error);
      return [];
    }
  }

  /**
   * Get statistics about indexed sources.
   *
   * @returns SourceStats with document counts per source
   */
  async getSourceStats(): Promise<SourceStats> {
    const stats: SourceStats = {
      totalDocuments: 0,
      sources: {},
    };

    // Initialize if needed
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch {
        return stats;
      }
    }

    if (!this.vectorStore) {
      return stats;
    }

    try {
      const tableStats = await this.vectorStore.getTableStats();
      stats.totalDocuments = tableStats.count;

      // Get counts by source
      for (const source of ["maestro", "memory"] as const) {
        const count = tableStats.sources[source] || 0;
        if (count > 0) {
          stats.sources[source] = count;
        }
      }
    } catch {
      // Return empty stats on error
    }

    return stats;
  }

  /**
   * Check if Resona services are healthy.
   *
   * @returns true if Ollama and LanceDB are available
   */
  async isHealthy(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // Try to connect to Ollama
      const response = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Register a search source.
   *
   * @param source Source to register
   */
  registerSource(source: SearchSource): void {
    this.sources.set(source.sourceId, source);
  }

  /**
   * Unregister a search source.
   *
   * @param sourceId ID of source to remove
   */
  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  /**
   * Check if a source is registered.
   *
   * @param sourceId Source ID to check
   * @returns true if source is registered
   */
  hasSource(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }

  /**
   * List registered source IDs.
   *
   * @returns Array of source IDs
   */
  listSources(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Convert raw search result to UnifiedResult.
   */
  private toUnifiedResult(
    result: SearchResult,
    sourceId: string
  ): UnifiedResult {
    // Parse source type from sourceId (e.g., "user/main" -> "user")
    const sourceType = this.parseSourceType(sourceId);

    return {
      id: result.id,
      content: result.contextText || "",
      source: sourceType,
      sourceId,
      similarity: result.similarity,
      metadata: result.metadata,
    };
  }

  /**
   * Convert vector search result to UnifiedResult.
   */
  private vectorResultToUnified(result: VectorSearchResult): UnifiedResult {
    // Use the source field from the vector store result directly
    // Fall back to parsing from ID only if source is empty
    const sourceType = result.source
      ? this.parseSourceType(result.source)
      : this.parseSourceType(result.id);

    // Parse metadata if it's a string
    let metadata: Record<string, unknown> = {};
    if (typeof result.metadata === "string") {
      try {
        metadata = JSON.parse(result.metadata);
      } catch {
        // Keep empty metadata
      }
    } else if (result.metadata) {
      metadata = result.metadata;
    }

    return {
      id: result.id,
      content: result.content,
      source: sourceType,
      sourceId: result.id,
      similarity: result.similarity,
      metadata,
    };
  }

  /**
   * Parse source type from source ID.
   *
   * Source ID formats:
   * - user/file.md -> "user"
   * - session/123 -> "session"
   * - tana/nodeId -> "tana"
   * - maestro:fileId:index -> "maestro"
   * - maestro -> "maestro" (when sourceId is just the source type)
   * - memory:LEARNING:filename -> "memory"
   */
  private parseSourceType(sourceId: string): SourceType {
    // Check for maestro format (uses colon separator or is just "maestro")
    if (sourceId.startsWith("maestro:") || sourceId === "maestro") {
      return "maestro";
    }

    // Check for memory format (uses colon separator: memory:TYPE:filename)
    if (sourceId.startsWith("memory:") || sourceId === "memory") {
      return "memory";
    }

    const type = sourceId.split("/")[0];
    if (type === "user" || type === "session" || type === "tana" || type === "maestro" || type === "memory") {
      return type;
    }
    return "user"; // Default to user
  }
}

// ============================================================================
// Factory and Helpers
// ============================================================================

/**
 * Create a new ResonaAdapter instance.
 *
 * @param config Optional configuration
 * @returns ResonaAdapter instance
 */
export function createResonaAdapter(
  config: ResonaAdapterConfig = {}
): ResonaAdapter {
  return new ResonaAdapter(config);
}

/**
 * Quick health check for Resona services.
 *
 * @returns true if Resona is available
 */
export async function isResonaHealthy(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
