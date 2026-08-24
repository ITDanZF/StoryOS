import type { AgentTurnInput } from "../../application/contracts.ts";
import type { CapabilityId, EffectId } from "../capabilities.ts";
import type { ExecutionRequirements } from "./contracts.ts";

const WRITE_PATTERN = /(?:完成|创作|续写|生成|创建|修改|更新|删除|重写|改写|填充|补全|写入|write|create|update|delete|rewrite|generate|complete)/i;
const EDITOR_PATTERN = /(?:格式|排版|样式|选区|加粗|斜体|format|style|selection)/i;
const FILE_PATTERN = /(?:文件|目录|路径|file|folder|path)/i;
const SKILL_PATTERN = /(?:技能|skill)/i;
const REVIEW_PATTERN = /(?:审查|检查|评审|问题|漏洞|一致性|review|critique)/i;
const REWRITE_PATTERN = /(?:润色|改写|缩写|扩写|翻译|rewrite|polish|translate)/i;
const SEARCH_PATTERN = /(?:搜索|查找|寻找|定位|search|find|locate)/i;
const ANALYZE_PATTERN = /(?:分析|总结|提取|比较|归纳|动机|结构|analy[sz]e|summari[sz]e|extract|compare)/i;

export default class RequirementResolver {
  resolve(input: AgentTurnInput): ExecutionRequirements {
    const content = input.message.content;
    const contextKinds = input.context ? ["book-editor" as const] : ["global" as const];
    const capabilities: CapabilityId[] = [];
    const effects: EffectId[] = [];

    if (WRITE_PATTERN.test(content)) {
      if (SKILL_PATTERN.test(content)) {
        capabilities.push("skill.write");
        effects.push("skill.write");
      } else if (input.context) {
        const editorWrite = EDITOR_PATTERN.test(content);
        capabilities.push(editorWrite ? "editor.write" : "book.write");
        effects.push(editorWrite ? "editor.write" : "book.write");
      } else if (FILE_PATTERN.test(content)) {
        capabilities.push("workspace.write");
        effects.push("workspace.write");
      } else {
        capabilities.push("text.rewrite");
      }
    } else if (REVIEW_PATTERN.test(content)) {
      capabilities.push("text.review");
    } else if (REWRITE_PATTERN.test(content)) {
      capabilities.push("text.rewrite");
    } else if (SEARCH_PATTERN.test(content)) {
      capabilities.push("text.search", "workspace.read");
    } else if (ANALYZE_PATTERN.test(content)) {
      capabilities.push("text.inspect");
    } else if (input.context) {
      capabilities.push("book.read");
    } else {
      capabilities.push("conversation.respond");
    }

    const specialistWork = effects.length === 0 && capabilities.some((item) =>
      item === "text.inspect"
      || item === "text.search"
      || item === "text.rewrite"
      || item === "text.review"
    );
    return Object.freeze({
      capabilities: Object.freeze([...new Set(capabilities)]),
      effects: Object.freeze([...new Set(effects)]),
      contextKinds: Object.freeze(contextKinds),
      outputKind: "text",
      decomposition: specialistWork ? "optional" : "forbidden",
    });
  }
}
