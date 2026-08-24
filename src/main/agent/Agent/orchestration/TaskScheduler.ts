import {
  createRunAbortScope,
  RunBudgetExceededError,
} from "../RunLimits.ts";
import type {
  ApprovedTaskResult,
  OrchestrationEventHandler,
  PlannedExecutionPlan,
  PlannedTask,
  ReviewResult,
  TaskResult,
} from "./contracts.ts";
import type {
  AnswerSynthesisProvider,
  PlannedTaskRunner,
  ResultReviewProvider,
} from "./ports.ts";
import type RunBudget from "../RunLimits.ts";
import type { ToolApprovalHandler } from "../../security/ToolPolicy.ts";
import type { AgentEventHandler } from "../AgentEvent.ts";
import AgentFailure from "../../errors/AgentFailure.ts";
import type { AgentTurnInput } from "../../application/contracts.ts";

export type ScheduleRequest = {
  readonly runId: string;
  readonly threadId: string;
  readonly goal: string;
  readonly input: AgentTurnInput;
  readonly plan: PlannedExecutionPlan;
  readonly signal?: AbortSignal;
  readonly budget: RunBudget;
  readonly approval: ToolApprovalHandler;
  readonly onAgentEvent: AgentEventHandler;
  readonly onEvent?: OrchestrationEventHandler;
};

type TaskExecutionOutcome =
  | { readonly ok: true; readonly result: ApprovedTaskResult }
  | { readonly ok: false; readonly failure: AgentFailure };

function describeTaskFailure(
  task: PlannedTask,
  result: TaskResult,
  review: ReviewResult,
): AgentFailure {
  const findings = review.findings
    .filter((finding) => !finding.passed)
    .map((finding) => finding.message.trim())
    .filter(Boolean);
  const details = [...new Set([
    ...(result.error ? [result.error] : []),
    ...findings,
  ])];
  const reason = details.length > 0
    ? details.join("；")
    : `执行状态为 ${result.status}，审查结论为 ${review.decision}`;
  return new AgentFailure(
    "review.criteria_failed",
    "review",
    `任务“${task.title}”未通过验收（${task.id}）：${reason}`,
    review.decision === "retry",
    { taskId: task.id, agentId: task.assignedAgentId },
  );
}

async function emit(
  handler: OrchestrationEventHandler | undefined,
  event: Parameters<OrchestrationEventHandler>[0],
): Promise<void> {
  await handler?.(Object.freeze(event));
}

export default class TaskScheduler {
  constructor(
    private readonly runner: PlannedTaskRunner,
    private readonly reviewer: ResultReviewProvider,
    private readonly synthesizer: AnswerSynthesisProvider,
  ) {}

  async run(request: ScheduleRequest): Promise<string> {
    const pending = new Map(request.plan.tasks.map((task) => [task.id, task]));
    const approved = new Map<string, ApprovedTaskResult>();
    const failed = new Set<string>();

    while (pending.size > 0) {
      this.throwIfAborted(request.signal);
      let progressed = false;

      for (const task of request.plan.tasks) {
        if (!pending.has(task.id)) {
          continue;
        }
        if (task.dependsOn.some((dependencyId) => failed.has(dependencyId))) {
          const dependencyFailure = new AgentFailure(
            "review.criteria_failed",
            "review",
            `任务“${task.title}”因依赖任务未通过验收而跳过。`,
            false,
            { taskId: task.id, agentId: task.assignedAgentId },
          );
          pending.delete(task.id);
          failed.add(task.id);
          progressed = true;
          await emit(request.onEvent, {
            type: "task_skipped",
            runId: request.runId,
            planId: request.plan.planId,
            taskId: task.id,
            failure: {
              code: dependencyFailure.code,
              phase: dependencyFailure.phase,
              message: dependencyFailure.message,
              retryable: dependencyFailure.retryable,
              ...dependencyFailure.details,
            },
            timestamp: new Date().toISOString(),
          });
          if (task.required) {
            throw dependencyFailure;
          }
          continue;
        }
        if (!task.dependsOn.every((dependencyId) => approved.has(dependencyId))) {
          continue;
        }

        pending.delete(task.id);
        progressed = true;
        request.budget.consumeSubtask(task.id);
        const outcome = await this.executeTask(request, task, approved);
        if (outcome.ok === true) {
          approved.set(task.id, outcome.result);
        } else {
          failed.add(task.id);
          if (task.required) {
            throw outcome.failure;
          }
        }
      }

      if (!progressed) {
        throw new Error("Task scheduler made no progress.");
      }
    }

    this.throwIfAborted(request.signal);
    await emit(request.onEvent, {
      type: "synthesis_started",
      runId: request.runId,
      planId: request.plan.planId,
      timestamp: new Date().toISOString(),
    });
    const content = await this.synthesizer.synthesize({
      rootRunId: request.runId,
      threadId: request.threadId,
      goal: request.goal,
      plan: request.plan,
      results: [...approved.values()],
      signal: request.signal,
      budget: request.budget,
    });
    this.throwIfAborted(request.signal);
    if (!content.trim()) {
      throw new Error("Answer synthesis returned empty content.");
    }
    await emit(request.onEvent, {
      type: "synthesis_completed",
      runId: request.runId,
      planId: request.plan.planId,
      timestamp: new Date().toISOString(),
    });
    return content;
  }

  private async executeTask(
    request: ScheduleRequest,
    task: PlannedTask,
    approved: ReadonlyMap<string, ApprovedTaskResult>,
  ): Promise<TaskExecutionOutcome> {
    const dependencyResults = task.dependsOn.map((id) => {
      const result = approved.get(id);
      if (!result) {
        throw new Error(`Approved dependency result not found: ${id}`);
      }
      return result;
    });
    let previousResult: TaskResult | undefined;
    let retryInstruction: string | undefined;

    for (let attempt = 1; attempt <= task.maxAttempts; attempt += 1) {
      this.throwIfAborted(request.signal);
      await emit(request.onEvent, {
        type: "task_started",
        runId: request.runId,
        planId: request.plan.planId,
        taskId: task.id,
        title: task.title,
        agentType: task.assignedAgentId,
        attempt,
        timestamp: new Date().toISOString(),
      });

      const startedAt = Date.now();
      const taskScope = createRunAbortScope(task.timeoutMs, request.signal);
      let result: TaskResult;
      try {
        const agentResult = await this.runner.runTask({
          rootRunId: request.runId,
          threadId: request.threadId,
          task,
          input: request.input,
          attempt,
          dependencyResults,
          ...(previousResult ? { previousResult } : {}),
          ...(retryInstruction ? { retryInstruction } : {}),
          signal: taskScope.signal,
          budget: request.budget,
          approval: request.approval,
          onAgentEvent: request.onAgentEvent,
        });
        const completedAt = new Date().toISOString();
        result = agentResult.status === "completed"
          ? {
              taskId: task.id,
              agentRunId: agentResult.runId,
              agentType: task.assignedAgentId,
              attempt,
              status: "completed",
              content: agentResult.content,
              startedAt: new Date(startedAt).toISOString(),
              completedAt,
              durationMs: Date.now() - startedAt,
            }
          : {
              taskId: task.id,
              agentRunId: agentResult.runId,
              agentType: task.assignedAgentId,
              attempt,
              status: taskScope.timedOut() ? "timed_out" : agentResult.status,
              content: agentResult.partialContent,
              startedAt: new Date(startedAt).toISOString(),
              completedAt,
              durationMs: Date.now() - startedAt,
              ...(agentResult.status === "failed"
                ? { error: agentResult.error }
                : {}),
            };
      } catch (error) {
        if (error instanceof RunBudgetExceededError) {
          throw error;
        }
        result = {
          taskId: task.id,
          agentRunId: "unknown",
          agentType: task.assignedAgentId,
          attempt,
          status: request.signal?.aborted
            ? "aborted"
            : taskScope.timedOut()
              ? "timed_out"
              : "failed",
          content: "",
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        taskScope.dispose();
      }

      this.throwIfAborted(request.signal);
      const review = await this.safeReview(
        request,
        task,
        result,
        dependencyResults,
      );
      this.throwIfAborted(request.signal);
      const reviewedResult = Object.freeze({ ...result, review });
      await emit(request.onEvent, {
        type: "task_reviewed",
        runId: request.runId,
        planId: request.plan.planId,
        taskId: task.id,
        attempt,
        decision: review.decision,
        score: review.score,
        timestamp: new Date().toISOString(),
      });

      if (review.decision === "pass" && result.status === "completed") {
        await emit(request.onEvent, {
          type: "task_completed",
          runId: request.runId,
          planId: request.plan.planId,
          taskId: task.id,
          timestamp: new Date().toISOString(),
        });
        return { ok: true, result: reviewedResult as ApprovedTaskResult };
      }

      if (review.decision === "retry" && attempt < task.maxAttempts) {
        previousResult = reviewedResult;
        retryInstruction = review.retryInstruction;
        await emit(request.onEvent, {
          type: "task_retrying",
          runId: request.runId,
          planId: request.plan.planId,
          taskId: task.id,
          nextAttempt: attempt + 1,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const failure = describeTaskFailure(task, result, review);
      await emit(request.onEvent, {
        type: "task_failed",
        runId: request.runId,
        planId: request.plan.planId,
        taskId: task.id,
        timestamp: new Date().toISOString(),
        failure: {
          code: failure.code,
          phase: failure.phase,
          message: failure.message,
          retryable: failure.retryable,
          ...failure.details,
        },
      });
      return { ok: false, failure };
    }
    return {
      ok: false,
      failure: new AgentFailure(
        "tool.execution_failed",
        "execution",
        `任务“${task.title}”未执行（${task.id}）。`,
        false,
        { taskId: task.id, agentId: task.assignedAgentId },
      ),
    };
  }

  private async safeReview(
    request: ScheduleRequest,
    task: PlannedTask,
    result: TaskResult,
    dependencyResults: readonly ApprovedTaskResult[],
  ): Promise<ReviewResult> {
    try {
      return await this.reviewer.review({
        rootRunId: request.runId,
        threadId: request.threadId,
        task,
        result,
        dependencyResults,
        signal: request.signal,
        budget: request.budget,
      });
    } catch (error) {
      if (error instanceof RunBudgetExceededError) {
        throw error;
      }
      return Object.freeze({
        decision: "fail",
        score: 0,
        findings: Object.freeze([{
          criterion: "Reviewer must return a valid structured decision",
          passed: false,
          severity: "error" as const,
          message: error instanceof Error ? error.message : String(error),
        }]),
      });
    }
  }

  private throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
      throw signal.reason ?? new Error("Orchestration aborted.");
    }
  }
}
