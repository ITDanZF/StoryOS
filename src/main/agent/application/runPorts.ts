import type { ApplicationEvent, RunSnapshot } from "./contracts.ts";

export interface ApplicationEventRecorder {
  record(event: ApplicationEvent): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RunHistoryStore extends ApplicationEventRecorder {
  loadRunSnapshots(limit?: number): Promise<readonly RunSnapshot[]>;
}
