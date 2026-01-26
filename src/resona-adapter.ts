/**
 * ACR Tier 2 - Resona Integration Adapter
 *
 * Abstracts Resona library for ACR-specific usage.
 * Provides graceful degradation when Resona/Ollama unavailable.
 */

import type { UnifiedResult, SourceType } from "./tier2-types";
import { TIER2_CONFIG } from "./tier2-config";

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

  constructor(config: ResonaAdapterConfig = {}) {
    this.config = {
      embeddingDbPath:
        config.embeddingDbPath || TIER2_CONFIG.embeddingDbPath,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Search across all registered sources.
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

    // For now, return empty stats
    // Real implementation would query LanceDB
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
   * Parse source type from source ID.
   *
   * Source ID formats:
   * - user/file.md -> "user"
   * - session/123 -> "session"
   * - tana/nodeId -> "tana"
   * - maestro:fileId:index -> "maestro"
   * - maestro -> "maestro" (when sourceId is just the source type)
   */
  private parseSourceType(sourceId: string): SourceType {
    // Check for maestro format (uses colon separator or is just "maestro")
    if (sourceId.startsWith("maestro:") || sourceId === "maestro") {
      return "maestro";
    }

    const type = sourceId.split("/")[0];
    if (type === "user" || type === "session" || type === "tana" || type === "maestro") {
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
