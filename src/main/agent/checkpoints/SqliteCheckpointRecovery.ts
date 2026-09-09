import type { CheckpointRecovery, ThreadCheckpointSnapshot } from "./CheckpointRecovery.ts";
import SqliteStore from "./SqliteStore.ts";
export default class SqliteCheckpointRecovery implements CheckpointRecovery {
  constructor(private readonly file: string) {}
  capture(threadId: string) {
    return SqliteStore.captureThreadCheckpoints(threadId, this.file);
  }
  restore(snapshot: ThreadCheckpointSnapshot) {
    SqliteStore.restoreThreadCheckpoints(snapshot, this.file);
  }
}
