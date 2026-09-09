import type {
  ApplicationEvent,
  ApplicationEventHandler,
} from "../../../../../shared/contracts/conversations/applicationContracts.ts";
import type { ApplicationEventRecorder } from "../runPorts.ts";
import EventPersistenceError from "./EventPersistenceError.ts";

/** Durable recording and best-effort delivery are deliberately separate. */
export default class RunEventPublisher {
  private readonly subscribers = new Set<ApplicationEventHandler>();
  constructor(private readonly recorder?: ApplicationEventRecorder) {}

  subscribe(handler: ApplicationEventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  async publish(event: ApplicationEvent): Promise<void> {
    await this.publishBatch([event]);
  }

  async publishBatch(events: readonly ApplicationEvent[]): Promise<void> {
    if (!events.length) return;
    let current = events[0];
    try {
      if (this.recorder?.recordBatch) await this.recorder.recordBatch(events);
      else
        for (const event of events) {
          current = event;
          await this.recorder?.record(event);
        }
    } catch (cause) {
      if (cause instanceof EventPersistenceError) throw cause;
      throw new EventPersistenceError(
        current.type,
        "runId" in current ? current.runId : "application",
        cause,
      );
    }
    for (const event of events) await this.notify(event);
  }

  /** Used for terminal diagnostics when storage itself is unavailable. */
  async notify(event: ApplicationEvent): Promise<void> {
    const results = await Promise.allSettled(
      [...this.subscribers].map((handler) => Promise.resolve().then(() => handler(event))),
    );
    for (const result of results) {
      if (result.status === "rejected")
        console.error("Run event listener failed", event.type, result.reason);
    }
  }

  async close(): Promise<void> {
    try {
      await this.recorder?.flush?.();
    } finally {
      try {
        await this.recorder?.close?.();
      } finally {
        this.subscribers.clear();
      }
    }
  }
}
