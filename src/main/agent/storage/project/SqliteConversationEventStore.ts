import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { ApplicationEvent } from "../../application/contracts.ts";
import type { ConversationEvent } from "../../application/conversationEvents.ts";
import type { ApplicationEventRecorder } from "../../application/runPorts.ts";

type ConversationEventRow = {
  readonly row_id: number;
  readonly event_id: string;
  readonly thread_id: string;
  readonly run_id: string;
  readonly sequence: number;
  readonly type: ConversationEvent["type"];
  readonly step_id: string | null;
  readonly block_id: string | null;
  readonly payload_json: string;
  readonly created_at: number;
};

function isConversationEvent(event: ApplicationEvent): event is ConversationEvent {
  return "eventId" in event && "sequence" in event;
}

export default class SqliteConversationEventStore implements ApplicationEventRecorder {
  constructor(private readonly database: BetterSqliteDatabase) {}

  async record(event: ApplicationEvent): Promise<void> {
    if (!isConversationEvent(event)) return;
    this.database.prepare(`
      INSERT INTO conversation_events(
        event_id, thread_id, run_id, sequence, type,
        step_id, block_id, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING
    `).run(
      event.eventId,
      event.threadId,
      event.runId,
      event.sequence,
      event.type,
      "stepId" in event ? event.stepId : null,
      "blockId" in event ? event.blockId : null,
      JSON.stringify(event.payload),
      Date.parse(event.timestamp),
    );
  }

  async listByThread(threadId: string): Promise<readonly ConversationEvent[]> {
    const rows = this.database.prepare(`
      SELECT * FROM conversation_events
      WHERE thread_id = ?
      ORDER BY row_id ASC
    `).all(threadId) as ConversationEventRow[];

    return Object.freeze(rows.map((row) => Object.freeze({
      eventId: row.event_id,
      threadId: row.thread_id,
      runId: row.run_id,
      sequence: row.sequence,
      type: row.type,
      timestamp: new Date(row.created_at).toISOString(),
      payload: JSON.parse(row.payload_json) as unknown,
      ...(row.step_id === null ? {} : { stepId: row.step_id }),
      ...(row.block_id === null ? {} : { blockId: row.block_id }),
    }) as ConversationEvent));
  }
}
