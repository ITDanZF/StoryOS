import { reviewerSystemPrompt } from "../prompts/ResultReviewer.prompt.ts";
import type { ReviewResult } from "./contracts.ts";
import { parseJsonObject } from "./json.ts";
import type { OrchestrationTextModel, ResultReviewProvider, ReviewRequest } from "./ports.ts";
import { reviewResultSchema } from "./schemas.ts";

function deterministicReview(request: ReviewRequest): ReviewResult | null {
  if (request.result.status !== "completed") {
    return Object.freeze({
      decision: "retry",
      score: 0,
      findings: Object.freeze([
        {
          criterion: "Task execution must complete",
          passed: false,
          severity: "error" as const,
          message: request.result.error ?? `Task ended with ${request.result.status}.`,
        },
      ]),
      retryInstruction: "Retry the task and complete the requested output.",
    });
  }
  if (!request.result.content.trim()) {
    return Object.freeze({
      decision: "retry",
      score: 0,
      findings: Object.freeze([
        {
          criterion: "Output must not be empty",
          passed: false,
          severity: "error" as const,
          message: "The task returned empty content.",
        },
      ]),
      retryInstruction: "Return a complete, non-empty result.",
    });
  }
  return null;
}

export default class ResultReviewer implements ResultReviewProvider {
  constructor(private readonly model: OrchestrationTextModel) {}

  async review(request: ReviewRequest): Promise<ReviewResult> {
    const deterministic = deterministicReview(request);
    if (deterministic) {
      return deterministic;
    }

    const dependencyText =
      request.dependencyResults.length === 0
        ? "None"
        : request.dependencyResults
            .map((result) => `<dependency id="${result.taskId}">\n${result.content}\n</dependency>`)
            .join("\n\n");
    request.budget?.consumeModelTurn(`reviewer model run for ${request.task.id}`);
    const output = await this.model.invokeText({
      prompt: [
        `Task objective:\n${request.task.objective}`,
        `Expected output:\n${request.task.expectedOutput}`,
        `Acceptance criteria:\n${request.task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
        `Dependency results:\n${dependencyText}`,
        `Task output:\n<task-output>\n${request.result.content}\n</task-output>`,
        "Required JSON shape:",
        '{"decision":"pass|retry|fail","score":0.0,"findings":[{"criterion":"...","passed":true,"severity":"info|warning|error","message":"..."}],"retryInstruction":"required only for retry"}',
      ].join("\n\n"),
      threadId: `${request.threadId}/orchestration/reviewer/${request.rootRunId}/${request.task.id}/${request.result.attempt}`,
      systemPrompt: reviewerSystemPrompt,
      tools: [],
      maxTurns: 1,
      visibility: "internal",
      signal: request.signal,
    });

    return reviewResultSchema.parse(parseJsonObject(output));
  }
}
