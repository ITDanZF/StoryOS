import Database from "better-sqlite3";
import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";
import { BOOK_CHANGE_TRIGGERS, BOOK_SCHEMA } from "./bookSchema.ts";
import { OUTLINE_SCHEMA } from "./outlineSchema.ts";

export const BOOK_DATABASE_APPLICATION_ID = 0x53544f42;

const migrations: readonly SqliteMigration[] = [
  {
    version: 100,
    up(database) {
      database.exec(BOOK_SCHEMA + BOOK_CHANGE_TRIGGERS);
    },
  },
  {
    version: 101,
    up(database) {
      database.exec(OUTLINE_SCHEMA);
    },
  },
];

export const BOOK_DATABASE_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export default class BookDatabase extends SqliteDatabase {
  /** Only used on an unpublished copy; source databases are never re-identified. */
  static identifyCopy(databasePath: string, bookId: string): void {
    const database = new BookDatabase(databasePath);
    try {
      database.handle.transaction(() => {
        database.handle.prepare("DELETE FROM book_changes").run();
        const result = database.handle
          .prepare("UPDATE books SET id=?,row_version=row_version+1,updated_at=?")
          .run(bookId, Date.now());
        if (result.changes !== 1) throw new Error("Copied database must contain exactly one book.");
      })();
    } finally {
      database.close();
    }
  }

  static validateExisting(databasePath: string): void {
    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const applicationId = database.pragma("application_id", {
        simple: true,
      }) as number;
      if (applicationId !== BOOK_DATABASE_APPLICATION_ID) {
        throw new Error("The SQLite file is not a StoryOS book database.");
      }
      const schemaVersion = database.pragma("user_version", {
        simple: true,
      }) as number;
      if (schemaVersion !== BOOK_DATABASE_SCHEMA_VERSION) {
        throw new Error(`Unsupported StoryOS book schema: ${schemaVersion}`);
      }
      if ((database.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Book foreign key validation failed.");
      const missing = database
        .prepare(
          "SELECT 1 FROM chapter_revisions r LEFT JOIN revision_documents d ON d.revision_id=r.id WHERE d.revision_id IS NULL LIMIT 1",
        )
        .get();
      if (missing) throw new Error("Book revision document is missing.");
      const integrity = database.pragma("quick_check(1)") as Array<{
        readonly quick_check: string;
      }>;
      if (integrity.length !== 1 || integrity[0]?.quick_check !== "ok") {
        throw new Error("The StoryOS book database failed its integrity check.");
      }
    } finally {
      database.close();
    }
  }

  constructor(databasePath: string) {
    super(databasePath, BOOK_DATABASE_APPLICATION_ID, migrations);
  }
}
