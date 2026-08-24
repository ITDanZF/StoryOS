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

function isVisualDelta(event: ConversationEvent): boolean {
  return event.type === "assistant.block.delta" || event.type === "tool.call.progress";
}

export class ConversationEventBatcher {
  private readonly pending: ConversationEvent[] = [];
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
    if (!isVisualDelta(event)) {
      this.flush();
      this.sink.applyEvent(event);
      return;
    }

    this.pending.push(event);
    if (this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      this.flushPending();
    });
  }

  flush(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.flushPending();
  }

  dispose(): void {
    this.flush();
  }

  private flushPending(): void {
    if (this.pending.length === 0) return;
    this.sink.applyEvents(this.pending.splice(0));
  }
}

