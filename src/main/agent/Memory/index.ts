import { MemorySaver } from "@langchain/langgraph";
import SqliteStore from "./SqliteStore.ts";
import JsonStore from "./JsonStore.ts";

export type ThreadId = string;
export type MemoryStore = {
  checkpointBackend?: "memory" | "sqlite";
};
export default class Memory {
  private readonly checkpointer;
  private readonly jsonStore;

  constructor(params: MemoryStore = {}) {
    const checkpointBackend = params.checkpointBackend ?? "memory";

    if (checkpointBackend === "sqlite") {
      this.checkpointer = new SqliteStore().getCheckpointer();
    } else {
      this.checkpointer = new MemorySaver();
    }

    this.jsonStore = new JsonStore();
  }

  getCheckpointer() {
    return this.checkpointer;
  }

  getJSONStore() {
    return this.jsonStore;
  }

  getConfig(threadId: ThreadId) {
    return {
      configurable: {
        thread_id: threadId,
      },
    };
  }
}
