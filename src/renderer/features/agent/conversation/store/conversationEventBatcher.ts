import type { ConversationEvent } from "../model/conversationEvent.ts";

type FrameHandle = number;

export type ConversationEventSink = {
  readonly applyEvent: (event: ConversationEvent) => void;
  readonly applyEvents: (events: readonly ConversationEvent[]) => void;
};

export type ConversationEventBatcherOptions = {
  readonly requestFrame?: (callback: () => void) => FrameHandle;
  readonly cancelFrame?: (handle: FrameHandle) => void;
};

export class ConversationEventBatcher {
  private readonly pendingToolProgress: ConversationEvent[] = [];
  private readonly requestFrame: (callback: () => void) => FrameHandle;
  private readonly cancelFrame: (handle: FrameHandle) => void;
  private frameHandle: FrameHandle | null = null;

  constructor(
    private readonly sink: ConversationEventSink,
    options: ConversationEventBatcherOptions = {},
  ) {
    this.requestFrame = options.requestFrame ?? ((callback) => {
      if (typeof globalThis.requestAnimationFrame === "function") {
        return globalThis.requestAnimationFrame(callback);
      }
      return globalThis.setTimeout(callback, 0) as unknown as number;
    });
    this.cancelFrame = options.cancelFrame ?? ((handle) => {
      if (typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(handle);
        return;
      }
      globalThis.clearTimeout(handle);
    });
  }

  enqueue(event: ConversationEvent): void {
    if (event.type === "assistant.block.delta") {
      // Token-sized deltas are intentionally non-visual. Current producers emit
      // one completed block with the full content; retaining the legacy deltas
      // here would recreate an unbounded renderer-side stream buffer.
      return;
    }

    if (event.type === "assistant.block.completed") {
      this.flushToolProgress();
      this.sink.applyEvent(event);
      return;
    }

    if (event.type !== "tool.call.progress") {
      this.flushToolProgress();
      this.sink.applyEvent(event);
      return;
    }

    this.pendingToolProgress.push(event);
    if (this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      this.flushToolProgress();
    });
  }

  flush(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.flushToolProgress();
  }

  dispose(): void {
    this.flush();
  }

  private flushToolProgress(): void {
    if (this.pendingToolProgress.length === 0) return;
    this.sink.applyEvents(this.pendingToolProgress.splice(0));
  }
}
