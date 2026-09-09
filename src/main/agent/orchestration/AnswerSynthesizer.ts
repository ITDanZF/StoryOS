import { synthesisSystemPrompt } from "../prompts/AnswerSynthesizer.prompt.ts";
import type { AnswerSynthesisProvider, OrchestrationTextModel, SynthesisRequest } from "./ports.ts";

export default class AnswerSynthesizer implements AnswerSynthesisProvider {
  constructor(private readonly model: OrchestrationTextModel) {}

  synthesize(request: SynthesisRequest): Promise<string> {
    const results = request.results
      .map((result) =>
        [
          `<approved-result task-id="${result.taskId}" agent="${result.agentType}">`,
          result.content,
          "</approved-result>",
        ].join("\n"),
      )
      .join("\n\n");

    request.budget?.consumeModelTurn("synthesis model run");
    return this.model.invokeText({
      prompt: [
        `Original goal:\n${request.goal}`,
        `Final acceptance criteria:\n${request.plan.finalAcceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
        `Approved task results:\n${results}`,
      ].join("\n\n"),
      threadId: `${request.threadId}/orchestration/synthesis/${request.rootRunId}`,
      systemPrompt: synthesisSystemPrompt,
      tools: [],
      maxTurns: 2,
      visibility: "internal",
      signal: request.signal,
    });
  }
}
