import path from "node:path";
import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";
import { APPLICATION_SCHEMA } from "./applicationSchema.ts";

const APPLICATION_DATABASE_ID = 0x53544f41;

const migrations: readonly SqliteMigration[] = [
  {
    version: 100,
    up(database) {
      database.exec(APPLICATION_SCHEMA);
    },
  },
];

export default class ApplicationDatabase extends SqliteDatabase {
  constructor(agentHome: string) {
    super(path.join(agentHome, "app.sqlite"), APPLICATION_DATABASE_ID, migrations);
  }
}
