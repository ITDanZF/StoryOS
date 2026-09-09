import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { ApplicationEvent } from "../../../../shared/contracts/conversations/applicationContracts.ts";
import type { ConversationEvent } from "../../../../shared/contracts/conversations/conversationEvents.ts";
import type { ApplicationEventRecorder } from "../../application/conversations/runPorts.ts";
import { appendConversationEvent } from "./conversationProjection.ts";

type ConversationEventRow = {
  readonly local_sequence: number;
  readonly thread_sequence: number;
  readonly event_id: string;
  readonly thread_id: string;
  readonly run_id: string;
  readonly run_sequence: number;
  readonly type: ConversationEvent["type"];
  readonly step_id: string | null;
  readonly block_id: string | null;
  readonly payload: string;
  readonly created_at: number;
};

function isConversationEvent(event: ApplicationEvent): event is ConversationEvent {
  return "eventId" in event && "sequence" in event;
}

export default class SqliteConversationEventStore implements ApplicationEventRecorder {
  constructor(private readonly database: BetterSqliteDatabase) {}

  async record(event: ApplicationEvent): Promise<void> {
    this.recordSync(event);
  }

  recordSync(event: ApplicationEvent): void {
    if (!isConversationEvent(event)) return;
    appendConversationEvent(this.database, {
      event_id: event.eventId,
      thread_id: event.threadId,
      run_id: event.runId,
      run_sequence: event.sequence,
      type: event.type,
      step_id: "stepId" in event ? event.stepId : null,
      block_id: "blockId" in event ? event.blockId : null,
      payload: JSON.stringify(event.payload),
      created_at: Date.parse(event.timestamp),
    });
  }

  async listByThread(
    threadId: string,
    afterSequence = 0,
    limit = 500,
  ): Promise<readonly ConversationEvent[]> {
    if (
      !Number.isSafeInteger(afterSequence) ||
      afterSequence < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error("Invalid event page.");
    const rows = this.database
      .prepare(
        `
      SELECT * FROM conversation_events
      WHERE thread_id = ? AND thread_sequence > ?
      ORDER BY thread_sequence ASC LIMIT ?
    `,
      )
      .all(threadId, afterSequence, limit) as ConversationEventRow[];

    return Object.freeze(
      rows.map(
        (row) =>
          Object.freeze({
            eventId: row.event_id,
            threadSequence: row.thread_sequence,
            threadId: row.thread_id,
            runId: row.run_id,
            sequence: row.run_sequence,
            type: row.type,
            timestamp: new Date(row.created_at).toISOString(),
            payload: JSON.parse(row.payload) as unknown,
            ...(row.step_id === null ? {} : { stepId: row.step_id }),
            ...(row.block_id === null ? {} : { blockId: row.block_id }),
          }) as ConversationEvent,
      ),
    );
  }
}
