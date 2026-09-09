import type { Database } from "better-sqlite3";
import type { BookReadingState } from "../../../../shared/book/reader.ts";

export interface BookReadingStateStore {
  get(bookId: string): BookReadingState | null;
  save(state: BookReadingState, expectedVersion?: number): void;
}

export default class SqliteBookReadingStateStore implements BookReadingStateStore {
  constructor(private readonly database: Database) {}
  get(bookId: string): BookReadingState | null {
    const row = this.database
      .prepare(
        `SELECT r.* FROM reading_states r JOIN app_state a
      ON r.profile_id=a.local_profile_id AND r.device_id=a.device_id WHERE r.book_id=?`,
      )
      .get(bookId) as
      | {
          state_version: number;
          anchor: string;
          preferences: string;
          updated_at: number;
        }
      | undefined;
    return row
      ? {
          bookId,
          schemaVersion: 1,
          stateVersion: row.state_version,
          anchor: JSON.parse(row.anchor),
          preferences: JSON.parse(row.preferences),
          lastReadAt: new Date(row.updated_at).toISOString(),
        }
      : null;
  }
  save(state: BookReadingState, expectedVersion = 0): void {
    const result = this.database
      .prepare(
        `INSERT INTO reading_states
      SELECT ?,local_profile_id,device_id,1,1,?,1,?,? FROM app_state WHERE singleton=1 AND ?=0
      ON CONFLICT(book_id,profile_id,device_id) DO NOTHING`,
      )
      .run(
        state.bookId,
        JSON.stringify(state.anchor),
        JSON.stringify(state.preferences),
        Date.parse(state.lastReadAt),
        expectedVersion,
      );
    if (result.changes === 1) return;
    const updated = this.database
      .prepare(
        `UPDATE reading_states SET state_version=state_version+1,anchor=?,preferences=?,updated_at=?
      WHERE book_id=? AND state_version=? AND (profile_id,device_id)=(SELECT local_profile_id,device_id FROM app_state WHERE singleton=1)`,
      )
      .run(
        JSON.stringify(state.anchor),
        JSON.stringify(state.preferences),
        Date.parse(state.lastReadAt),
        state.bookId,
        expectedVersion,
      );
    if (updated.changes !== 1)
      throw new Error("阅读进度已被其他窗口更新，请重新打开阅读器。");
  }
}
