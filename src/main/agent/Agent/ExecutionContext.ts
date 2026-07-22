export type ExecutionContext = {
  readonly runId: string;
  readonly agentType: string;
  readonly parentRunId?: string;
  readonly parentThreadId: string;
  readonly threadId: string;
  readonly depth: number;
  readonly startedAt: Date;
  readonly signal?: AbortSignal;
};

export type CreateExecutionContextInput = {
  readonly agentType: string;
  readonly parentRunId?: string;
  readonly parentThreadId: string;
  readonly depth?: number;
  readonly signal?: AbortSignal;
};

export type CreateRootExecutionContextInput = {
  readonly runId?: string;
  readonly threadId: string;
  readonly signal?: AbortSignal;
};

export function createRootExecutionContext(
  input: CreateRootExecutionContextInput,
): ExecutionContext {
  const threadId = input.threadId.trim();
  const runId = input.runId?.trim() ?? `run_${crypto.randomUUID()}`;

  if (!threadId) {
    throw new Error("Thread id is required.");
  }
  if (!runId) {
    throw new Error("Run id is required.");
  }

  return Object.freeze({
    runId,
    agentType: "main",
    parentThreadId: threadId,
    threadId,
    depth: 0,
    startedAt: new Date(),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

export function createExecutionContext(
  input: CreateExecutionContextInput,
): ExecutionContext {
  const agentType = input.agentType.trim();
  const parentThreadId = input.parentThreadId.trim();
  const parentRunId = input.parentRunId?.trim();
  const depth = input.depth ?? 0;

  if (!agentType) {
    throw new Error("Agent type is required.");
  }
  if (!parentThreadId) {
    throw new Error("Parent thread id is required.");
  }
  if (input.parentRunId !== undefined && !parentRunId) {
    throw new Error("Parent run id cannot be empty.");
  }
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error("Execution depth must be a non-negative integer.");
  }

  const runId = `run_${crypto.randomUUID()}`;
  return Object.freeze({
    runId,
    agentType,
    ...(parentRunId ? { parentRunId } : {}),
    parentThreadId,
    threadId: [parentThreadId, "agents", agentType, runId].join("/"),
    depth,
    startedAt: new Date(),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
