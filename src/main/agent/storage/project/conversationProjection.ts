import {
  deriveThreadTitle,
  isUntitledThreadTitle,
} from "../../../../shared/agent/threadTitle.ts";
import type { Database } from "better-sqlite3";

export type StoredEvent = {
  event_id: string;
  thread_id: string;
  thread_sequence: number;
  run_id: string | null;
  run_sequence: number | null;
  type: string;
  step_id: string | null;
  block_id: string | null;
  payload: string;
  created_at: number;
};
type Block = {
  id: string;
  type: string;
  content?: string;
  channel?: string;
  [key: string]: unknown;
};

/** Deterministic projection; the same function is used during append and full rebuild. */
export function projectConversationEvent(
  database: Database,
  event: StoredEvent,
): void {
  const payload = JSON.parse(event.payload) as Record<string, unknown>;
  const user = event.type === "user.message.created";
  const standalone = event.type === "message.created";
  if (!user && !standalone && !event.run_id) return;
  if (event.type === "turn.started") return;
  if (user) {
    const thread = database
      .prepare("SELECT title FROM threads WHERE id=?")
      .get(event.thread_id) as { title: string };
    const prior = database
      .prepare(
        "SELECT 1 FROM message_views WHERE thread_id=? AND role='user' LIMIT 1",
      )
      .get(event.thread_id);
    if (!prior && isUntitledThreadTitle(thread.title))
      database
        .prepare("UPDATE threads SET title=? WHERE id=?")
        .run(deriveThreadTitle(String(payload.content)), event.thread_id);
  }
  const id =
    user || standalone
      ? String(payload.messageId)
      : `${event.run_id}:assistant`;
  const previous = database
    .prepare("SELECT blocks,status FROM message_views WHERE id=?")
    .get(id) as { blocks: string; status: string } | undefined;
  const blocks: Block[] = previous ? JSON.parse(previous.blocks) : [];
  let status = previous?.status ?? "streaming";
  if (user || standalone) {
    blocks.push({ id, type: "text", content: String(payload.content) });
    status = "completed";
  } else if (event.type.startsWith("assistant.block.")) {
    const key = `${event.step_id}:${event.block_id}`;
    let block = blocks.find((b) => b.id === key);
    if (!block) {
      block = {
        id: key,
        type: "text",
        channel: String(payload.channel),
        content: "",
      };
      blocks.push(block);
    }
    if (event.type.endsWith(".delta"))
      block.content = (block.content ?? "") + String(payload.delta);
    if (typeof payload.content === "string") block.content = payload.content;
  } else if (event.type === "turn.completed") {
    status = "completed";
    if (!blocks.some((b) => b.channel === "answer" && b.content))
      blocks.push({
        id: "answer",
        type: "text",
        channel: "answer",
        content: String(payload.content),
      });
  } else if (event.type === "turn.failed") {
    status = "failed";
    blocks.push({ id: event.event_id, type: event.type, ...payload });
  } else {
    // Retain tool, approval and task information together with visible text blocks.
    blocks.push({ id: event.event_id, type: event.type, ...payload });
  }
  database
    .prepare(
      `INSERT INTO message_views VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    last_sequence=excluded.last_sequence,status=excluded.status,blocks=excluded.blocks,updated_at=excluded.updated_at`,
    )
    .run(
      id,
      event.thread_id,
      event.thread_sequence,
      event.thread_sequence,
      user ? "user" : standalone ? String(payload.role) : "assistant",
      status,
      JSON.stringify(blocks),
      event.created_at,
    );
  database
    .prepare(
      "UPDATE threads SET updated_at=?,row_version=row_version+1 WHERE id=?",
    )
    .run(event.created_at, event.thread_id);
}

export function appendConversationEvent(
  database: Database,
  input: Omit<StoredEvent, "thread_sequence">,
): void {
  database.transaction(() => {
    const existing = database
      .prepare(
        "SELECT payload,type,thread_id,run_id,run_sequence FROM conversation_events WHERE event_id=?",
      )
      .get(input.event_id) as Partial<StoredEvent> | undefined;
    if (existing) {
      if (
        existing.payload !== input.payload ||
        existing.type !== input.type ||
        existing.thread_id !== input.thread_id ||
        existing.run_id !== input.run_id ||
        existing.run_sequence !== input.run_sequence
      )
        throw new Error("Conversation event identity conflict");
      return;
    }
    const next = database
      .prepare(
        "SELECT COALESCE(MAX(thread_sequence),0)+1 AS n FROM conversation_events WHERE thread_id=?",
      )
      .get(input.thread_id) as { n: number };
    const event = { ...input, thread_sequence: next.n };
    database
      .prepare(
        `INSERT INTO conversation_events(event_id,thread_id,thread_sequence,run_id,run_sequence,type,schema_version,step_id,block_id,payload,created_at)
      VALUES (?,?,?,?,?,?,1,?,?,?,?)`,
      )
      .run(
        event.event_id,
        event.thread_id,
        event.thread_sequence,
        event.run_id,
        event.run_sequence,
        event.type,
        event.step_id,
        event.block_id,
        event.payload,
        event.created_at,
      );
    projectConversationEvent(database, event);
  })();
}

export function rebuildMessageViews(
  database: Database,
  threadId: string,
): void {
  database.transaction(() => {
    database
      .prepare("DELETE FROM message_views WHERE thread_id=?")
      .run(threadId);
    let cursor = 0;
    for (;;) {
      const rows = database
        .prepare(
          "SELECT * FROM conversation_events WHERE thread_id=? AND thread_sequence>? ORDER BY thread_sequence LIMIT 500",
        )
        .all(threadId, cursor) as StoredEvent[];
      for (const row of rows) projectConversationEvent(database, row);
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].thread_sequence;
    }
  })();
}
