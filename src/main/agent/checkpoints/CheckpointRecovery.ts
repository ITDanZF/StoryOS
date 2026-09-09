export type CheckpointRow = {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
  readonly parent_checkpoint_id: string | null;
  readonly type: string | null;
  readonly checkpoint: Buffer;
  readonly metadata: Buffer;
};

export type WriteRow = {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
  readonly task_id: string;
  readonly idx: number;
  readonly channel: string;
  readonly type: string | null;
  readonly value: Buffer;
};

export type ThreadCheckpointSnapshot = {
  readonly threadId: string;
  readonly checkpoints: readonly CheckpointRow[];
  readonly writes: readonly WriteRow[];
};
export interface CheckpointRecovery {
  capture(threadId: string): ThreadCheckpointSnapshot | null;
  restore(snapshot: ThreadCheckpointSnapshot): void;
}
