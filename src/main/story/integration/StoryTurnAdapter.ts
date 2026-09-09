import type { AgentTurnInput } from "../../../shared/contracts/conversations/applicationContracts.ts";
import type { AgentInput } from "../../agent/runtime/AgentInput.ts";
import StoryPromptCompiler from "./StoryPromptCompiler.ts";
import StoryRequirementResolver from "./StoryRequirementResolver.ts";
const retryInstruction = `
<storyos_required_action>
上一轮没有完成用户要求的实际写入。本轮禁止只说明接下来准备做什么。
你必须调用可用工具完成至少一次实际写入后才能给出最终答复。
如果当前书籍为空且用户要求编写第一章：先读取书籍大纲，创建第一卷（如有必要）和第一章，再调用 generate_book_chapter_content 生成并保存正文。
如果确实缺少无法合理推断的关键信息，应明确说明缺少什么；不要用“我先查看”“接下来处理”等过程说明作为最终答复。
</storyos_required_action>
`.trim();
const proseRequest =
  /(?:创作|续写|生成|完成|补全|编写|写).*(?:第.{0,8}章|章节|正文)|(?:第.{0,8}章|章节|正文).*(?:创作|续写|生成|完成|补全|编写|写)/i;
export function toAgentInput(input: AgentTurnInput): AgentInput {
  return {
    message: input.message,
    prompt: new StoryPromptCompiler().compile(input),
    requirements: new StoryRequirementResolver().resolve(input),
    completion: {
      retryInstruction,
      ...(proseRequest.test(input.message.content)
        ? { preferredToolIds: ["generate_book_chapter_content"] }
        : {}),
    },
  };
}
