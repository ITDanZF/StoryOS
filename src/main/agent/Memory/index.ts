import { MemorySaver } from "@langchain/langgraph";
import SqliteStore from "./SqliteStore.ts";

export type ThreadId = string;
export type MemoryStore = {
  checkpointBackend?: "memory" | "sqlite";
  checkpointPath?: string;
};

export default class Memory {
  private readonly checkpointer;
  private readonly sqliteStore: SqliteStore | null;

  constructor(params: MemoryStore = {}) {
    const checkpointBackend = params.checkpointBackend ?? "memory";
    if (checkpointBackend === "sqlite") {
      this.sqliteStore = new SqliteStore(params.checkpointPath);
      this.checkpointer = this.sqliteStore.getCheckpointer();
    } else {
      this.sqliteStore = null;
      this.checkpointer = new MemorySaver();
    }
  }

  getCheckpointer() {
    return this.checkpointer;
  }

  getConfig(threadId: ThreadId) {
    return { configurable: { thread_id: threadId } };
  }

  close(): void {
    this.sqliteStore?.close();
  }
}