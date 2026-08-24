import type { AgentTurnInput } from "../application/contracts.ts";

export default class PromptCompiler {
  compile(input: AgentTurnInput): string {
    const content = input.message.content.trim();
    const context = input.context;
    if (!context) return content;

    const lines = [
      "<trusted_storyos_context>",
      `当前项目：${context.projectName}（${context.projectId}）`,
    ];
    if (context.book) {
      lines.push(`当前书籍：《${context.book.title}》（${context.book.id}）`);
    } else {
      lines.push("当前项目尚未创建书籍。");
    }
    if (context.chapter) {
      const chapter = context.chapter;
      lines.push(
        `当前章节：${chapter.volumeTitle} / 第${chapter.number}章《${chapter.title}》（${chapter.id}）`,
        `章节修订：${chapter.revisionNumber ?? "尚未保存"}`,
        `当前页：${chapter.pageNumber ?? "未知"}`,
      );
      if (chapter.selection) {
        lines.push(
          `编辑器选区：${chapter.selection.from}-${chapter.selection.to}`,
          "<selection>",
          chapter.selection.text,
          "</selection>",
        );
      } else {
        lines.push("编辑器当前没有选中文本。");
      }
      lines.push("<chapter_text>", chapter.documentText, "</chapter_text>");
    } else {
      lines.push("当前位于书籍概览，没有打开具体章节。");
    }
    lines.push(
      "以上字段由 StoryOS 提供，仅作为本轮上下文；不要声称已通过文件工具读取它。",
      "</trusted_storyos_context>",
      "",
      "<user_request>",
      content,
      "</user_request>",
    );
    return lines.join("\n");
  }
}

