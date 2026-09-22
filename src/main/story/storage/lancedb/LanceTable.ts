import type { Table as NativeTable } from "@lancedb/lancedb";
import { LanceClosedError, LanceDatabaseError, LanceSchemaError } from "./errors.ts";
import {
  assertSchemaCompatible,
  fromArrowSchema,
  inspectLanceSchema,
  normalizeRecord,
  normalizeResultRow,
  requireVectorColumn,
  requireVectorValues,
  type InspectedLanceSchema,
  type LanceRecord,
  type LanceTableSchema,
  type LanceVectorColumn,
} from "./schema.ts";
import { requireIdentifier, requirePredicate } from "./sql.ts";

export type LanceVectorMetric = "cosine" | "l2" | "dot";

export type LanceQueryOptions = {
  readonly filter?: string;
  readonly select?: readonly string[];
  readonly limit?: number;
};

export type LanceVectorSearchRequest = {
  readonly vector: readonly number[] | Float32Array;
  readonly column?: string;
  readonly filter?: string;
  readonly limit: number;
  readonly metric?: LanceVectorMetric;
  readonly select?: readonly string[];
  readonly exact?: boolean;
};

export type LanceVectorHit = {
  readonly row: LanceRecord;
  readonly distance: number;
};

export type LanceMergeResult = {
  readonly inserted: number;
  readonly updated: number;
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new LanceSchemaError(`${label} must be a positive integer.`);
  }
  return value;
}

function requireOpenTable(table: NativeTable | null, name: string): NativeTable {
  if (!table || !table.isOpen()) {
    throw new LanceClosedError(`LanceDB table ${name}`);
  }
  return table;
}

export default class LanceTable {
  private native: NativeTable | null;
  readonly name: string;
  readonly schema: InspectedLanceSchema;
  readonly vectorColumns: readonly LanceVectorColumn[];

  constructor(table: NativeTable, schema: InspectedLanceSchema) {
    this.native = table;
    this.name = table.name;
    this.schema = schema;
    this.vectorColumns = schema.vectorColumns;
  }

  static async fromNative(table: NativeTable, expected?: LanceTableSchema): Promise<LanceTable> {
    const actual = fromArrowSchema(await table.schema());
    if (expected) {
      assertSchemaCompatible(inspectLanceSchema(expected), actual);
    }
    return new LanceTable(table, actual);
  }

  get isOpen(): boolean {
    return this.native?.isOpen() === true;
  }

  close(): void {
    if (!this.native) return;
    this.native.close();
    this.native = null;
  }

  async add(rows: readonly LanceRecord[]): Promise<void> {
    if (rows.length === 0) return;
    const payload = rows.map((row) => normalizeRecord(row, this.schema) as Record<string, unknown>);
    await this.requireTable().add(payload);
  }

  async mergeByKey(
    key: string | readonly string[],
    rows: readonly LanceRecord[],
  ): Promise<LanceMergeResult> {
    const keys = (Array.isArray(key) ? key : [key]).map((column) =>
      requireIdentifier(column, "Merge key"),
    );
    if (keys.length === 0) {
      throw new LanceSchemaError("Merge key is required.");
    }
    for (const column of keys) {
      if (!this.schema.columns.some((item) => item.name === column)) {
        throw new LanceSchemaError(`Merge key is not a table column: ${column}`);
      }
    }
    if (rows.length === 0) {
      return { inserted: 0, updated: 0 };
    }
    const table = this.requireTable();
    const payload = rows.map((row) => normalizeRecord(row, this.schema) as Record<string, unknown>);
    const result = await table
      .mergeInsert(keys)
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(payload);
    return {
      inserted: result.numInsertedRows,
      updated: result.numUpdatedRows,
    };
  }

  async deleteWhere(predicate: string): Promise<void> {
    await this.requireTable().delete(requirePredicate(predicate, "Delete predicate"));
  }

  async count(filter?: string): Promise<number> {
    const table = this.requireTable();
    if (filter === undefined) return table.countRows();
    return table.countRows(requirePredicate(filter, "Count filter"));
  }

  async query(options: LanceQueryOptions = {}): Promise<LanceRecord[]> {
    const table = this.requireTable();
    let query = table.query();
    if (options.filter !== undefined) {
      query = query.where(requirePredicate(options.filter, "Query filter"));
    }
    if (options.select !== undefined) {
      query = query.select(this.requireSelect(options.select));
    }
    if (options.limit !== undefined) {
      query = query.limit(requirePositiveInteger(options.limit, "Query limit"));
    }
    const rows = await query.toArray();
    return rows.map((row) => normalizeResultRow(row as Record<string, unknown>));
  }

  async vectorSearch(request: LanceVectorSearchRequest): Promise<LanceVectorHit[]> {
    const vectorColumn = requireVectorColumn(this.schema, request.column);
    const vector = requireVectorValues(request.vector, vectorColumn.dimensions, "Query vector");
    const limit = requirePositiveInteger(request.limit, "Search limit");
    const metric = request.metric ?? "cosine";
    const table = this.requireTable();
    let search = table.vectorSearch(vector).column(vectorColumn.name).distanceType(metric).limit(limit);
    if (request.exact !== false) {
      search = search.bypassVectorIndex();
    }
    if (request.filter !== undefined) {
      search = search.where(requirePredicate(request.filter, "Search filter"));
    }
    if (request.select !== undefined) {
      const columns = this.requireSelect(request.select);
      if (!columns.includes("_distance")) columns.push("_distance");
      search = search.select(columns);
    }
    const rows = await search.toArray();
    return rows.map((raw) => {
      const record = normalizeResultRow(raw as Record<string, unknown>);
      const distance = record._distance;
      if (typeof distance !== "number") {
        throw new LanceDatabaseError("Vector search did not return a distance.");
      }
      const { _distance: _ignored, ...row } = record;
      void _ignored;
      return { row, distance };
    });
  }

  assertCompatible(schema: LanceTableSchema): void {
    assertSchemaCompatible(inspectLanceSchema(schema), this.schema);
  }

  private requireTable(): NativeTable {
    return requireOpenTable(this.native, this.name);
  }

  private requireSelect(columns: readonly string[]): string[] {
    if (columns.length === 0) {
      throw new LanceSchemaError("Select requires at least one column.");
    }
    return columns.map((column) => {
      if (column === "_distance") return column;
      requireIdentifier(column, "Select column");
      if (!this.schema.columns.some((item) => item.name === column)) {
        throw new LanceSchemaError(`Select column does not exist: ${column}`);
      }
      return column;
    });
  }
}
