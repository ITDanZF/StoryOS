import type { RunnableConfig } from "@langchain/core/runnables";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

export interface ModelSessionStore {
  getCheckpointer(): BaseCheckpointSaver;
  getConfig(threadId: string): RunnableConfig;
  close(): void;
}
