export type SqlValue =
  | { type: "null" }
  | { type: "integer" | "real" | "text" | "blob"; value: string };
export type DatabaseInfo = { id: string; name: string; path: string };
export type TableInfo = { name: string; type: string };
export type ColumnInfo = {
  name: string;
  type: string;
  affinity: string;
  notNull: boolean;
  defaultSql: string | null;
  primaryKey: number;
  hidden: number;
};
export type TableSchema = TableInfo & {
  version: number;
  columns: ColumnInfo[];
  withoutRowid: boolean;
  strict: boolean;
  locator: string[];
  insertable: boolean;
  writable: boolean;
  reason: string | null;
  sql: string | null;
  objects: { type: string; name: string; sql: string | null }[];
  foreignKeys: Record<string, string | number | null>[];
};
export type RowIdentity = SqlValue[];
export type DataRow = { cells: SqlValue[]; truncated: boolean[]; identity: RowIdentity | null };
export type RowDetail = { values: SqlValue[]; fingerprint: string };
export type TableRequest = { databaseId: string; table: string; version: number };
export type QueryRequest = TableRequest & {
  offset: number;
  limit: number;
  sort?: { column: string; direction: "asc" | "desc" };
  filter?: {
    column: string;
    operator: "eq" | "ne" | "contains" | "gt" | "lt" | "null" | "notNull";
    value: SqlValue;
  };
};
export type RowRequest = TableRequest & { identity: RowIdentity };
export type MutationRequest = TableRequest & {
  operation: "insert" | "update" | "delete";
  values: Record<string, SqlValue>;
  identity?: RowIdentity;
  fingerprint?: string;
};
export type DeveloperStatus = {
  editing: boolean;
  paused: boolean;
  backups: string[];
  warnings: string[];
};
export interface DeveloperDatabaseApi {
  status(): Promise<DeveloperStatus>;
  listDatabases(): Promise<DatabaseInfo[]>;
  listTables(databaseId: string): Promise<TableInfo[]>;
  describeTable(databaseId: string, table: string): Promise<TableSchema>;
  queryRows(request: QueryRequest): Promise<{ rows: DataRow[]; hasMore: boolean }>;
  readRow(request: RowRequest): Promise<RowDetail>;
  mutate(request: MutationRequest): Promise<void>;
  beginEditSession(): Promise<DeveloperStatus>;
  endEditSession(): Promise<void>;
}
export const DEVELOPER_DATABASE_CHANNEL = "storyos:developer-database";
