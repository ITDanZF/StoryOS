import type {
  ApplicationEvent,
  RunSnapshot,
} from "../../../../shared/contracts/conversations/applicationContracts.ts";

export interface ApplicationEventRecorder {
  record(event: ApplicationEvent): Promise<void>;
  recordBatch?(events: readonly ApplicationEvent[]): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RunHistoryStore extends ApplicationEventRecorder {
  loadRunSnapshots(limit?: number): Promise<readonly RunSnapshot[]>;
}
