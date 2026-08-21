export type BookEditorSelectionContext = {
  readonly from: number;
  readonly to: number;
  readonly text: string;
};

export type BookEditorChapterContext = {
  readonly id: string;
  readonly title: string;
  readonly number: number;
  readonly volumeTitle: string;
  readonly revisionNumber: number | null;
  readonly pageNumber: number | null;
  readonly documentText: string;
  readonly selection: BookEditorSelectionContext | null;
};

export type BookEditorConversationContext = {
  readonly kind: "book_editor";
  readonly projectId: string;
  readonly projectName: string;
  readonly book: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly chapter: BookEditorChapterContext | null;
};

export type ConversationTurnContext = BookEditorConversationContext;

export function formatConversationTurnInput(
  content: string,
  context?: ConversationTurnContext,
): string {
  if (!context) return content;

  const lines = [
    "<storyos_workspace_context>",
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
    lines.push(
      "<chapter_text>",
      chapter.documentText,
      "</chapter_text>",
    );
  } else {
    lines.push("当前位于书籍概览，没有打开具体章节。");
  }
  lines.push(
    "以上内容来自当前编辑器实时状态，仅作为本轮上下文；不要声称已通过文件工具读取它。",
    "</storyos_workspace_context>",
    "",
    content,
  );
  return lines.join("\n");
}
