/**
 * Vector Store
 * F-007: Resona Integration
 *
 * LanceDB-based vector storage for embeddings.
 */

import * as lancedb from "@lancedb/lancedb";
import { mkdir } from "fs/promises";
import { dirname } from "path";

/**
 * Record stored in the vector database
 */
export interface EmbeddingStoreRecord {
  id: string;
  vector: Float32Array;
  content: string;
  source: string; // "maestro" | "memory" | "session"
  metadata: string; // JSON-encoded
  timestamp: number;
  created_at: number;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  similarity: number;
  timestamp: number;
}

/**
 * Table statistics
 */
export interface TableStats {
  count: number;
  sources: Record<string, number>;
}

/**
 * Search filter options
 */
export interface SearchFilter {
  source?: string;
  minTimestamp?: number;
}

const TABLE_NAME = "embeddings";

export class VectorStore {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the vector store
   * Creates database and table if they don't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure parent directory exists
    await mkdir(dirname(this.dbPath), { recursive: true });

    // Connect to LanceDB
    this.db = await lancedb.connect(this.dbPath);

    // Check if table exists
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      // Create empty table with schema
      // LanceDB requires at least one record to infer schema
      // We'll create on first insert
      this.table = null;
    }

    this.initialized = true;
  }

  /**
   * Get table statistics
   */
  async getTableStats(): Promise<TableStats> {
    if (!this.table) {
      return { count: 0, sources: {} };
    }

    try {
      const count = await this.table.countRows();

      // Get source breakdown
      const sources: Record<string, number> = {};

      // Query all unique sources and count
      const allRows = await this.table.query().select(["source"]).toArray();
      for (const row of allRows) {
        const source = row.source as string;
        sources[source] = (sources[source] || 0) + 1;
      }

      return { count, sources };
    } catch {
      return { count: 0, sources: {} };
    }
  }

  /**
   * Insert or update records
   * Returns the number of records processed
   */
  async upsert(records: EmbeddingStoreRecord[]): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    // Convert Float32Array to regular array for LanceDB
    const data = records.map((r) => ({
      id: r.id,
      vector: Array.from(r.vector),
      content: r.content,
      source: r.source,
      metadata: r.metadata,
      timestamp: r.timestamp,
      created_at: r.created_at,
    }));

    if (!this.table) {
      // Create table with first batch
      this.table = await this.db!.createTable(TABLE_NAME, data);
      return records.length;
    }

    // For existing table, delete existing IDs first, then add
    const existingIds = records.map((r) => r.id);
    await this.delete(existingIds);

    // Add new records
    await this.table.add(data);

    return records.length;
  }

  /**
   * Delete records by source ID
   * Returns the number of records deleted
   */
  async delete(sourceIds: string[]): Promise<number> {
    if (sourceIds.length === 0 || !this.table) {
      return 0;
    }

    const countBefore = await this.table.countRows();

    // Delete matching records
    const idList = sourceIds.map((id) => `'${id}'`).join(", ");
    await this.table.delete(`id IN (${idList})`);

    const countAfter = await this.table.countRows();
    return countBefore - countAfter;
  }

  /**
   * Delete all records of a source type
   * Returns the number of records deleted
   */
  async deleteBySource(source: "maestro" | "memory" | "session"): Promise<number> {
    if (!this.table) {
      return 0;
    }

    const countBefore = await this.table.countRows();
    await this.table.delete(`source = '${source}'`);
    const countAfter = await this.table.countRows();

    return countBefore - countAfter;
  }

  /**
   * Get a record by ID
   */
  async get(sourceId: string): Promise<EmbeddingStoreRecord | null> {
    if (!this.table) {
      return null;
    }

    try {
      const results = await this.table
        .query()
        .where(`id = '${sourceId}'`)
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      return {
        id: row.id as string,
        vector: new Float32Array(row.vector as number[]),
        content: row.content as string,
        source: row.source as string,
        metadata: row.metadata as string,
        timestamp: row.timestamp as number,
        created_at: row.created_at as number,
      };
    } catch {
      return null;
    }
  }

  /**
   * Search for similar vectors
   */
  async search(
    queryVector: Float32Array,
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.table) {
      return [];
    }

    try {
      let query = this.table
        .vectorSearch(Array.from(queryVector))
        .distanceType("cosine")
        .limit(limit);

      // Apply filters
      const whereClauses: string[] = [];
      if (filter?.source) {
        whereClauses.push(`source = '${filter.source}'`);
      }
      if (filter?.minTimestamp) {
        whereClauses.push(`timestamp >= ${filter.minTimestamp}`);
      }

      if (whereClauses.length > 0) {
        query = query.where(whereClauses.join(" AND "));
      }

      const results = await query.toArray();

      return results.map((row) => {
        // LanceDB returns _distance as cosine distance (1 - cosine_similarity)
        // So cosine similarity = 1 - distance
        const distance = (row._distance as number) || 0;
        const similarity = Math.max(0, 1 - distance);

        let metadata: Record<string, unknown> = {};
        try {
          metadata = JSON.parse(row.metadata as string);
        } catch {
          // Ignore parse errors
        }

        return {
          id: row.id as string,
          content: row.content as string,
          source: row.source as string,
          metadata,
          similarity,
          timestamp: row.timestamp as number,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    // LanceDB connections don't need explicit closing
    this.db = null;
    this.table = null;
    this.initialized = false;
  }
}
