import type { Database } from "better-sqlite3";
import type { BookReadingState } from "../../../../shared/book/reader.ts";

export interface BookReadingStateStore {
  get(bookId: string): BookReadingState | null;
  save(state: BookReadingState): void;
}

export default class SqliteBookReadingStateStore implements BookReadingStateStore {
  constructor(private readonly database: Database) {}
  get(bookId: string): BookReadingState | null {
    const row = this.database.prepare("SELECT state_json FROM book_reading_states WHERE book_id = ?").get(bookId) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) as BookReadingState : null;
  }
  save(state: BookReadingState): void {
    this.database.prepare(`INSERT INTO book_reading_states(book_id, state_json)
      VALUES (?, ?) ON CONFLICT(book_id) DO UPDATE SET state_json = excluded.state_json`)
      .run(state.bookId, JSON.stringify(state));
  }
}
