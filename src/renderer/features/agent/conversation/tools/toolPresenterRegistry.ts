import type { ToolCallNode } from "../model/conversationNode.ts";

export type ToolPresentation = {
  readonly label: string;
  readonly summary: string;
};

type ToolPresenter = {
  readonly label: string;
  readonly running: string;
  readonly completed: string;
};

const toolPresenters: Readonly<Record<string, ToolPresenter>> = {
  get_book_outline: { label: "读取", running: "正在读取书籍目录", completed: "已读取书籍目录" },
  read_book_chapter: { label: "读取", running: "正在读取章节正文", completed: "已读取章节正文" },
  create_book_chapter: { label: "创建", running: "正在创建新章节", completed: "已创建新章节" },
  update_book_chapter: { label: "保存", running: "正在保存章节信息", completed: "已保存章节信息" },
  generate_book_chapter_content: { label: "创作", running: "正在生成章节正文", completed: "已生成并保存章节正文" },
  replace_book_chapter_text: { label: "修改", running: "正在替换章节正文", completed: "已更新章节正文" },
  rewrite_book_chapter_text: { label: "润色", running: "正在重写章节正文", completed: "已更新章节正文" },
  edit_text_range: { label: "修改", running: "正在修改选中文本", completed: "已完成文本修改" },
  batch_edit_text: { label: "修改", running: "正在批量修改文本", completed: "已完成批量修改" },
  apply_active_editor_styles: { label: "排版", running: "正在应用正文样式", completed: "已应用正文样式" },
  list_files: { label: "浏览", running: "正在读取项目文件", completed: "已读取项目文件" },
  read_file: { label: "读取", running: "正在读取文件内容", completed: "已读取文件内容" },
  search_text: { label: "搜索", running: "正在搜索项目文本", completed: "已完成文本搜索" },
  ranked_search_text: { label: "搜索", running: "正在检索相关内容", completed: "已完成内容检索" },
  edit_file: { label: "修改", running: "正在修改文件", completed: "已更新文件" },
  write_file: { label: "写入", running: "正在写入文件", completed: "已写入文件" },
};

function fallbackSummary(node: ToolCallNode): string {
  if (node.status === "failed") return "执行失败";
  if (node.status === "rejected") return "已取消";
  if (node.status === "awaiting_approval") return "等待确认";
  if (node.status === "completed") return "已完成";
  return "正在执行";
}

export function getToolPresentation(node: ToolCallNode): ToolPresentation {
  const presenter = toolPresenters[node.toolName];
  if (!presenter) {
    return {
      label: "执行",
      summary: fallbackSummary(node),
    };
  }

  if (node.status === "failed") return { label: presenter.label, summary: "执行失败" };
  if (node.status === "rejected") return { label: presenter.label, summary: "已取消" };
  if (node.status === "awaiting_approval") return { label: presenter.label, summary: "等待确认" };
  return {
    label: presenter.label,
    summary: node.status === "completed" ? presenter.completed : presenter.running,
  };
}
