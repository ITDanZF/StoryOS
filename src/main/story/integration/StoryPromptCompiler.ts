import type { AgentTurnInput } from "../../../shared/contracts/conversations/applicationContracts.ts";
import { BOOK_EDITOR_PAGE_EXCERPT_MAX_CHARS } from "../../../shared/contracts/conversations/conversationTurnContext.ts";

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
        `章节修订：${chapter.revisionNumber ?? "尚未保存"}${chapter.revisionId ? `（${chapter.revisionId}）` : ""}`,
        `当前页：${chapter.pageNumber ?? "未知"}`,
      );
      if (chapter.selection) {
        lines.push(`编辑器选区：${chapter.selection.from}-${chapter.selection.to}`);
        if (chapter.selection.text !== null) {
          lines.push("<selection>", chapter.selection.text, "</selection>");
        } else {
          lines.push(
            "选区文本超过预算，未内嵌。请使用 inspect_active_editor_text 或 read_book_chapter 读取该范围。",
          );
        }
      } else {
        lines.push("编辑器当前没有选中文本。");
      }
      if (chapter.pageExcerpt !== null) {
        lines.push(
          `当前页摘录（仅当前页，最多 ${BOOK_EDITOR_PAGE_EXCERPT_MAX_CHARS} 字；其他卷、其他章、本章其余页未包含）。需要更多正文时使用 get_book_outline、search_book_chapters 或 read_book_chapter。任务依赖其他章的人物、物件、约定或已有写法时，先用 search_novel_passages 或 find_similar_passages；这两个工具报错时再改用 search_book_chapters。`,
          "<page_excerpt>",
          chapter.pageExcerpt,
          "</page_excerpt>",
        );
      } else {
        lines.push(
          "当前页摘录：无。分页尚未就绪或本章无正文。需要正文时请调用 read_book_chapter。任务依赖其他章的人物、物件、约定或已有写法时，先用 search_novel_passages 或 find_similar_passages；这两个工具报错时再改用 search_book_chapters。",
        );
      }
    } else {
      lines.push(
        "当前位于书籍概览，没有打开具体章节。任务依赖已写正文时，先用 search_novel_passages 或 find_similar_passages；这两个工具报错时再改用 search_book_chapters。",
      );
    }
    lines.push(
      "以上字段由 StoryOS 提供，仅作为本轮上下文；不要声称已通过文件工具读取它，也不要把它当作全书或整章正文。",
      "</trusted_storyos_context>",
      "",
      "<user_request>",
      content,
      "</user_request>",
    );
    return lines.join("\n");
  }
}
