import type { ApplicationEvent } from "../../../../../shared/contracts/conversations/applicationContracts.ts";

export default class EventPersistenceError extends Error {
  readonly code = "event.persistence_failed";
  constructor(
    readonly eventType: ApplicationEvent["type"],
    readonly runId: string,
    cause: unknown,
  ) {
    super(`Unable to persist ${eventType} for run ${runId}.`, { cause });
    this.name = "EventPersistenceError";
  }
}
