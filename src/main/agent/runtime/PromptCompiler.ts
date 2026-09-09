import type { AgentInput } from "./AgentInput.ts";
export default class PromptCompiler {
  compile(input: AgentInput): string {
    return input.prompt ?? input.message.content.trim();
  }
}
