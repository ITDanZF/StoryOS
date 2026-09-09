import type { Database } from "better-sqlite3";
import type { NovelStatus } from "../../application/novelPorts.ts";

type Catalog = {
  title: string;
  synopsis: string;
  writing_status: NovelStatus;
  volume_count: number;
  chapter_count: number;
  character_count: number;
  content_updated_at: number;
  source_sequence: number;
};

/** Small, disposable read model; no revision document is loaded by this consumer. */
export default class BookCatalogProjection {
  constructor(private readonly app: Database) {}

  get deviceId(): string {
    return (
      this.app
        .prepare("SELECT device_id FROM app_state WHERE singleton=1")
        .get() as { device_id: string }
    ).device_id;
  }

  read(bookId: string): Catalog | null {
    return (
      (this.app
        .prepare(
          `SELECT c.* FROM book_catalog c JOIN book_registry r USING(book_id)
      WHERE c.book_id=? AND c.source_generation=r.source_generation`,
        )
        .get(bookId) as Catalog | undefined) ?? null
    );
  }

  refresh(bookId: string, source: Database): void {
    const snapshot = source.transaction(() => {
      const book = source
        .prepare("SELECT id,title,synopsis,status,updated_at FROM books")
        .get() as
        | {
            id: string;
            title: string;
            synopsis: string;
            status: string;
            updated_at: number;
          }
        | undefined;
      if (!book || book.id !== bookId)
        throw new Error(`Book identity mismatch: ${bookId}`);
      const stats = source
        .prepare(
          `SELECT COUNT(*) AS chapters,COALESCE(SUM(r.character_count),0) AS characters,
        COALESCE(MAX(c.updated_at),0) AS updated FROM chapters c
        LEFT JOIN chapter_revisions r ON r.id=c.current_revision_id WHERE c.deleted_at IS NULL`,
        )
        .get() as { chapters: number; characters: number; updated: number };
      const volumes = source
        .prepare(
          "SELECT COUNT(*) AS count,COALESCE(MAX(updated_at),0) AS updated FROM volumes WHERE deleted_at IS NULL",
        )
        .get() as { count: number; updated: number };
      const changes = source
        .prepare(
          "SELECT local_sequence AS sequence,created_at AS updated FROM book_changes ORDER BY local_sequence DESC LIMIT 1",
        )
        .get() as { sequence: number; updated: number } | undefined;
      return {
        book,
        stats,
        volumes,
        changes: changes ?? { sequence: 0, updated: 0 },
      };
    })();
    this.app.transaction(() => {
      const registry = this.app
        .prepare("SELECT source_generation FROM book_registry WHERE book_id=?")
        .get(bookId) as { source_generation: string } | undefined;
      if (!registry) return;
      const { book, stats, volumes, changes } = snapshot;
      const now = Date.now();
      this.app
        .prepare(
          `INSERT INTO book_catalog VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(book_id) DO UPDATE SET
        title=excluded.title,synopsis=excluded.synopsis,writing_status=excluded.writing_status,
        volume_count=excluded.volume_count,chapter_count=excluded.chapter_count,character_count=excluded.character_count,
        content_updated_at=excluded.content_updated_at,source_generation=excluded.source_generation,
        source_sequence=excluded.source_sequence,refreshed_at=excluded.refreshed_at`,
        )
        .run(
          bookId,
          book.title,
          book.synopsis,
          book.status,
          volumes.count,
          stats.chapters,
          stats.characters,
          Math.max(
            book.updated_at,
            stats.updated,
            volumes.updated,
            changes.updated,
          ),
          registry.source_generation,
          changes.sequence,
          now,
        );
      this.app
        .prepare(
          `INSERT INTO projection_cursors VALUES ('book_catalog',?,?,?,?)
        ON CONFLICT(consumer,book_id) DO UPDATE SET source_generation=excluded.source_generation,
        last_sequence=excluded.last_sequence,updated_at=excluded.updated_at`,
        )
        .run(bookId, registry.source_generation, changes.sequence, now);
    })();
  }
}
