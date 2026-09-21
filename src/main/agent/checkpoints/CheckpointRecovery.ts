export type CheckpointPointer = {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
};

export type WritePointer = {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
  readonly task_id: string;
  readonly idx: number;
};

export type ThreadCheckpointSnapshot = {
  readonly threadId: string;
  readonly checkpoints: readonly CheckpointPointer[];
  readonly writes: readonly WritePointer[];
};

export interface CheckpointRecovery {
  capture(threadId: string): ThreadCheckpointSnapshot | null;
  restore(snapshot: ThreadCheckpointSnapshot): void;
}
