import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";

const BOOK_DATABASE_ID = 0x53544f42;

const migrations: readonly SqliteMigration[] = [
  {
    version: 1,
    up(database) {
      database.exec(`
        CREATE TABLE novels (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          synopsis TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL
            CHECK (status IN ('planning', 'writing', 'completed', 'archived')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_novels_updated_at
          ON novels(updated_at DESC);

        CREATE UNIQUE INDEX idx_novels_book_singleton
          ON novels((1));

        CREATE TABLE volumes (
          id TEXT PRIMARY KEY,
          novel_id TEXT NOT NULL
            REFERENCES novels(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(novel_id, sort_order)
        );

        CREATE TABLE chapters (
          id TEXT PRIMARY KEY,
          novel_id TEXT NOT NULL
            REFERENCES novels(id) ON DELETE CASCADE,
          volume_id TEXT
            REFERENCES volumes(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('outline', 'draft', 'revising', 'completed')),
          sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
          current_revision_id TEXT
            REFERENCES chapter_revisions(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX idx_chapters_unvolumed_order
          ON chapters(novel_id, sort_order)
          WHERE volume_id IS NULL;

        CREATE UNIQUE INDEX idx_chapters_volume_order
          ON chapters(volume_id, sort_order)
          WHERE volume_id IS NOT NULL;

        CREATE INDEX idx_chapters_novel
          ON chapters(novel_id, volume_id, sort_order);

        CREATE TABLE chapter_revisions (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL
            REFERENCES chapters(id) ON DELETE CASCADE,
          revision_number INTEGER NOT NULL CHECK (revision_number > 0),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          character_count INTEGER NOT NULL CHECK (character_count >= 0),
          change_summary TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          UNIQUE(chapter_id, revision_number)
        );

        CREATE INDEX idx_chapter_revisions_chapter
          ON chapter_revisions(chapter_id, revision_number DESC);
      `);
    },
  },
];

export default class BookDatabase extends SqliteDatabase {
  constructor(databasePath: string) {
    super(databasePath, BOOK_DATABASE_ID, migrations);
  }
}
