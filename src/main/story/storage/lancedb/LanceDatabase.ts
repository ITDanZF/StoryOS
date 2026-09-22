import { connect, type Connection } from "@lancedb/lancedb";
import { LanceClosedError, LanceDatabaseError, LanceTableNotFoundError } from "./errors.ts";
import LanceTable from "./LanceTable.ts";
import { resolveLocalLanceDirectory } from "./pathGuard.ts";
import { inspectLanceSchema, toArrowSchema, type LanceTableSchema } from "./schema.ts";
import { requireIdentifier } from "./sql.ts";

export type CreateLanceTableOptions = {
  readonly existOk?: boolean;
};

export default class LanceDatabase {
  private connection: Connection | null;
  readonly directoryPath: string;
  private readonly tables = new Map<string, LanceTable>();

  private constructor(directoryPath: string, connection: Connection) {
    this.directoryPath = directoryPath;
    this.connection = connection;
  }

  static async open(directoryPath: string): Promise<LanceDatabase> {
    const resolved = resolveLocalLanceDirectory(directoryPath);
    const connection = await connect(resolved);
    return new LanceDatabase(resolved, connection);
  }

  get isOpen(): boolean {
    return this.connection?.isOpen() === true;
  }

  close(): void {
    for (const table of this.tables.values()) {
      table.close();
    }
    this.tables.clear();
    if (!this.connection) return;
    this.connection.close();
    this.connection = null;
  }

  async listTables(): Promise<readonly string[]> {
    const connection = this.requireConnection();
    const names: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await connection.listTables({ pageToken, limit: 100 });
      names.push(...page.tables);
      pageToken = page.pageToken;
    } while (pageToken);
    return names;
  }

  async hasTable(name: string): Promise<boolean> {
    requireIdentifier(name, "Table name");
    const names = await this.listTables();
    return names.includes(name);
  }

  async createTable(
    name: string,
    schema: LanceTableSchema,
    options: CreateLanceTableOptions = {},
  ): Promise<LanceTable> {
    requireIdentifier(name, "Table name");
    inspectLanceSchema(schema);
    const connection = this.requireConnection();
    if (await this.hasTable(name)) {
      if (!options.existOk) {
        throw new LanceDatabaseError(`LanceDB table already exists: ${name}`);
      }
      return this.openTable(name, schema);
    }
    const table = await connection.createEmptyTable(name, toArrowSchema(schema));
    const wrapped = await LanceTable.fromNative(table, schema);
    this.tables.set(name, wrapped);
    return wrapped;
  }

  async openTable(name: string, expectedSchema?: LanceTableSchema): Promise<LanceTable> {
    requireIdentifier(name, "Table name");
    const connection = this.requireConnection();
    if (!(await this.hasTable(name))) {
      throw new LanceTableNotFoundError(name);
    }
    const cached = this.tables.get(name);
    if (cached?.isOpen) {
      if (expectedSchema) cached.assertCompatible(expectedSchema);
      return cached;
    }
    const table = await connection.openTable(name);
    const wrapped = await LanceTable.fromNative(table, expectedSchema);
    this.tables.set(name, wrapped);
    return wrapped;
  }

  async dropTable(name: string): Promise<void> {
    requireIdentifier(name, "Table name");
    const connection = this.requireConnection();
    if (!(await this.hasTable(name))) {
      throw new LanceTableNotFoundError(name);
    }
    this.tables.get(name)?.close();
    this.tables.delete(name);
    await connection.dropTable(name);
  }

  private requireConnection(): Connection {
    if (!this.connection || !this.connection.isOpen()) {
      throw new LanceClosedError("LanceDB connection");
    }
    return this.connection;
  }
}
