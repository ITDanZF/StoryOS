export type RunLimits = {
  readonly maxTurns: number;
  readonly maxToolCalls: number;
  readonly timeoutMs: number;
  readonly maxDelegationDepth: number;
  readonly maxSubtasks?: number;
};

function readTimeoutMsFromEnv(): number {
  const rawValue = process.env.MINI_AGENT_TIMEOUT_MS?.trim();
  if (!rawValue) {
    return 900_000;
  }

  const timeoutMs = Number(rawValue);
  return Number.isInteger(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0;
}

export const DEFAULT_RUN_LIMITS: RunLimits = Object.freeze({
  // A book-writing task commonly needs several read, create, open, and write
  // rounds. Keep this aligned with LangGraph's default 25-superstep budget:
  // LangChainModelGateway maps 12 agent turns to 25 graph supersteps.
  maxTurns: 12,
  maxToolCalls: 20,
  timeoutMs: readTimeoutMsFromEnv(),
  maxDelegationDepth: 1,
  maxSubtasks: 6,
});

export class RunBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunBudgetExceededError";
  }
}

export class RunTimedOutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Agent run timed out after ${timeoutMs}ms.`);
    this.name = "RunTimedOutError";
  }
}

export default class RunBudget {
  private toolCalls = 0;
  private modelTurns = 0;
  private subtasks = 0;

  constructor(readonly limits: RunLimits = DEFAULT_RUN_LIMITS) {
    if (!Number.isInteger(limits.maxTurns) || limits.maxTurns <= 0) {
      throw new Error("maxTurns must be a positive integer.");
    }
    if (!Number.isInteger(limits.maxToolCalls) || limits.maxToolCalls <= 0) {
      throw new Error("maxToolCalls must be a positive integer.");
    }
    if (!Number.isInteger(limits.timeoutMs) || limits.timeoutMs < 0) {
      throw new Error("timeoutMs must be a non-negative integer.");
    }
    if (
      !Number.isInteger(limits.maxDelegationDepth) ||
      limits.maxDelegationDepth < 0
    ) {
      throw new Error("maxDelegationDepth must be a non-negative integer.");
    }
    if (
      limits.maxSubtasks !== undefined &&
      (!Number.isInteger(limits.maxSubtasks) || limits.maxSubtasks < 0)
    ) {
      throw new Error("maxSubtasks must be a non-negative integer.");
    }
  }

  consumeModelTurn(label: string): void {
    if (this.modelTurns >= this.limits.maxTurns) {
      throw new RunBudgetExceededError(
        `Model turn budget exceeded before ${label}. Maximum: ${this.limits.maxTurns}.`,
      );
    }

    this.modelTurns += 1;
  }

  consumeToolCall(toolName: string): void {
    if (this.toolCalls >= this.limits.maxToolCalls) {
      throw new RunBudgetExceededError(
        `Tool call budget exceeded before executing ${toolName}. Maximum: ${this.limits.maxToolCalls}.`,
      );
    }

    this.toolCalls += 1;
  }

  consumeSubtask(taskId: string): void {
    const maxSubtasks = this.limits.maxSubtasks ?? DEFAULT_RUN_LIMITS.maxSubtasks ?? 0;
    if (this.subtasks >= maxSubtasks) {
      throw new RunBudgetExceededError(
        `Subtask budget exceeded before ${taskId}. Maximum: ${maxSubtasks}.`,
      );
    }

    this.subtasks += 1;
  }

  getToolCallCount(): number {
    return this.toolCalls;
  }

  getModelTurnCount(): number {
    return this.modelTurns;
  }

  getSubtaskCount(): number {
    return this.subtasks;
  }
}

export type RunAbortScope = {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly abort: (reason?: unknown) => void;
  readonly dispose: () => void;
};

export function createRunAbortScope(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): RunAbortScope {
  const controller = new AbortController();
  let didTimeOut = false;
  const timeout = timeoutMs > 0
    ? setTimeout(() => {
        didTimeOut = true;
        controller.abort(new Error(`Agent run timed out after ${timeoutMs}ms.`));
      }, timeoutMs)
    : undefined;
  timeout?.unref?.();

  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  return Object.freeze({
    signal: controller.signal,
    timedOut: () => didTimeOut,
    abort: (reason?: unknown) => controller.abort(reason),
    dispose: () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  });
}
