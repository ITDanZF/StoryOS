import AgentRuntime, { type AgentRunResult } from "../AgentRuntime.ts";
import type { PlannedTaskRunner, TaskExecutionRequest } from "./ports.ts";

function buildTaskPrompt(request: TaskExecutionRequest): string {
  const dependencies = request.dependencyResults.length === 0
    ? "None"
    : request.dependencyResults.map((result) => [
        `<dependency id="${result.taskId}">`,
        result.content,
        "</dependency>",
      ].join("\n")).join("\n\n");
  const retry = request.retryInstruction
    ? [
        "RETRY REVIEW",
        request.retryInstruction,
        "PREVIOUS OUTPUT",
        request.previousResult?.content ?? "",
      ].join("\n")
    : "";

  return [
    "TASK OBJECTIVE",
    request.task.objective,
    "EXPECTED OUTPUT",
    request.task.expectedOutput,
    "ACCEPTANCE CRITERIA",
    request.task.acceptanceCriteria.map((item) => `- ${item}`).join("\n"),
    "DEPENDENCY RESULTS",
    dependencies,
    retry,
  ].filter(Boolean).join("\n\n");
}

export default class AgentTaskRunner implements PlannedTaskRunner {
  constructor(private readonly runtime: AgentRuntime) {}

  runTask(request: TaskExecutionRequest): Promise<AgentRunResult> {
    return this.runtime.run({
      agentType: request.task.agentType,
      prompt: buildTaskPrompt(request),
      parentThreadId: request.threadId,
      parentRunId: request.rootRunId,
      depth: 1,
      signal: request.signal,
      onEvent: request.onAgentEvent,
      budget: request.budget,
      approval: request.approval,
    });
  }
}
