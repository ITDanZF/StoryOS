import type { Database } from "better-sqlite3";
import type { ApplicationEvent } from "../../../../shared/contracts/conversations/applicationContracts.ts";
import type { ApplicationEventRecorder } from "../../application/conversations/runPorts.ts";
import EventPersistenceError from "../../application/conversations/events/EventPersistenceError.ts";

export default class SqliteApplicationEventRecorder implements ApplicationEventRecorder {
  constructor(
    private readonly database: Database,
    private readonly runs: { recordSync(event: ApplicationEvent): void },
    private readonly conversations: { recordSync(event: ApplicationEvent): void },
  ) {}
  async record(event: ApplicationEvent): Promise<void> {
    await this.recordBatch([event]);
  }
  async recordBatch(events: readonly ApplicationEvent[]): Promise<void> {
    this.database.transaction(() => {
      for (const event of events) {
        try {
          this.runs.recordSync(event);
          this.conversations.recordSync(event);
        } catch (cause) {
          throw new EventPersistenceError(
            event.type,
            "runId" in event ? event.runId : "application",
            cause,
          );
        }
      }
    })();
  }
}
