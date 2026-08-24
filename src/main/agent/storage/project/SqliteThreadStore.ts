import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  MessageRecord,
  MessageRole,
  ThreadMetadata,
  ThreadPersistence,
  ThreadRecord,
} from "../../application/threadPorts.ts";

type ThreadRow = {
  readonly id: string;
  readonly title: string;
  readonly created_at: number;
  readonly updated_at: number;
};

type MessageRow = {
  readonly id: string;
  readonly thread_id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly created_at: number;
};

type SkillRow = {
  readonly skill_id: string;
  readonly status: "active" | "disabled";
};

export default class SqliteThreadStore implements ThreadPersistence {
  constructor(private readonly database: BetterSqliteDatabase) {}

  createThread(
    title: string,
    id: string = crypto.randomUUID(),
    metadata?: ThreadMetadata,
  ): ThreadRecord {
    const now = Date.now();
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO threads(id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(id, title, now, now);
      this.replaceSkillState(id, metadata);
    })();
    return this.requireThread(id);
  }

  getThread(threadId: string): ThreadRecord | null {
    const row = this.database.prepare("SELECT * FROM threads WHERE id = ?")
      .get(threadId) as ThreadRow | undefined;
    return row ? this.toThreadRecord(row) : null;
  }

  listThreads(): ThreadRecord[] {
    return (this.database.prepare(
      "SELECT * FROM threads ORDER BY updated_at DESC, id ASC",
    ).all() as ThreadRow[]).map((row) => this.toThreadRecord(row));
  }

  touchThread(threadId: string): void {
    const result = this.database.prepare(
      "UPDATE threads SET updated_at = ? WHERE id = ?",
    ).run(Date.now(), threadId);
    if (result.changes === 0) throw new Error(`Thread not found: ${threadId}`);
  }

  updateThreadTitle(threadId: string, title: string): ThreadRecord {
    const normalized = title.trim();
    if (!normalized) throw new Error("Thread title is required.");
    const result = this.database.prepare(
      "UPDATE threads SET title = ?, updated_at = ? WHERE id = ?",
    ).run(normalized, Date.now(), threadId);
    if (result.changes === 0) throw new Error(`Thread not found: ${threadId}`);
    return this.requireThread(threadId);
  }

  updateThreadMetadata(
    threadId: string,
    metadata: ThreadMetadata,
  ): ThreadRecord {
    this.database.transaction(() => {
      this.requireThreadRow(threadId);
      this.replaceSkillState(threadId, metadata);
      this.database.prepare("UPDATE threads SET updated_at = ? WHERE id = ?")
        .run(Date.now(), threadId);
    })();
    return this.requireThread(threadId);
  }

  deleteThread(threadId: string): void {
    const result = this.database.prepare("DELETE FROM threads WHERE id = ?")
      .run(threadId);
    if (result.changes === 0) throw new Error(`Thread not found: ${threadId}`);
  }

  appendMessage(input: {
    readonly threadId: string;
    readonly role: MessageRole;
    readonly content: string;
    readonly id?: string;
  }): MessageRecord {
    const id = input.id ?? crypto.randomUUID();
    const now = Date.now();
    this.database.transaction(() => {
      this.requireThreadRow(input.threadId);
      const row = this.database.prepare(`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
        FROM messages WHERE thread_id = ?
      `).get(input.threadId) as { sequence: number };
      this.database.prepare(`
        INSERT INTO messages(
          id, thread_id, sequence, role, content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.threadId,
        row.sequence,
        input.role,
        input.content,
        now,
      );
      this.database.prepare("UPDATE threads SET updated_at = ? WHERE id = ?")
        .run(now, input.threadId);
    })();
    return {
      id,
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: new Date(now),
    };
  }

  listMessages(threadId: string): MessageRecord[] {
    this.requireThreadRow(threadId);
    return (this.database.prepare(`
      SELECT id, thread_id, role, content, created_at
      FROM messages
      WHERE thread_id = ?
      ORDER BY sequence ASC
    `).all(threadId) as MessageRow[]).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at),
    }));
  }

  getActiveThreadId(): string | null {
    const row = this.database.prepare(`
      SELECT active_thread_id FROM workspace_state WHERE singleton = 1
    `).get() as { active_thread_id: string | null };
    return row.active_thread_id;
  }

  setActiveThreadId(threadId: string | null): void {
    if (threadId !== null) this.requireThreadRow(threadId);
    this.database.prepare(`
      UPDATE workspace_state
      SET active_thread_id = ?, updated_at = ?
      WHERE singleton = 1
    `).run(threadId, Date.now());
  }

  private requireThread(threadId: string): ThreadRecord {
    return this.toThreadRecord(this.requireThreadRow(threadId));
  }

  private requireThreadRow(threadId: string): ThreadRow {
    const row = this.database.prepare("SELECT * FROM threads WHERE id = ?")
      .get(threadId) as ThreadRow | undefined;
    if (!row) throw new Error(`Thread not found: ${threadId}`);
    return row;
  }

  private toThreadRecord(row: ThreadRow): ThreadRecord {
    const skills = this.database.prepare(`
      SELECT skill_id, status FROM thread_skills
      WHERE thread_id = ? ORDER BY skill_id ASC
    `).all(row.id) as SkillRow[];
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata: {
        activeSkillIds: Object.freeze(
          skills.filter((skill) => skill.status === "active")
            .map((skill) => skill.skill_id),
        ),
        disabledSkillIds: Object.freeze(
          skills.filter((skill) => skill.status === "disabled")
            .map((skill) => skill.skill_id),
        ),
      },
    };
  }

  private replaceSkillState(
    threadId: string,
    metadata: ThreadMetadata | undefined,
  ): void {
    const active = this.normalizeSkillIds(metadata?.activeSkillIds);
    const disabled = this.normalizeSkillIds(metadata?.disabledSkillIds)
      .filter((skillId) => !active.includes(skillId));
    this.database.prepare("DELETE FROM thread_skills WHERE thread_id = ?")
      .run(threadId);
    const insert = this.database.prepare(`
      INSERT INTO thread_skills(thread_id, skill_id, status)
      VALUES (?, ?, ?)
    `);
    for (const skillId of active) insert.run(threadId, skillId, "active");
    for (const skillId of disabled) insert.run(threadId, skillId, "disabled");
  }

  private normalizeSkillIds(skillIds: readonly string[] | undefined): string[] {
    return [...new Set((skillIds ?? [])
      .filter((value): value is string => typeof value === "string")
      .map((skillId) => skillId.trim())
      .filter(Boolean))].sort();
  }
}
