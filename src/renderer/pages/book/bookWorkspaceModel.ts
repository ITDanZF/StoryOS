import type { BookWorkspaceChapterDto } from "../../../shared/agent/contracts.ts";
export type BookSaveState = "saved" | "saving" | "error";

const STATUS_LABELS = {
  outline: "大纲",
  draft: "草稿",
  revising: "修订",
  completed: "完成",
} as const;

export function chapterStatusLabel(
  chapter: BookWorkspaceChapterDto,
): string {
  if (!chapter.currentRevisionId && !chapter.content) return "未开始";
  return STATUS_LABELS[chapter.status];
}
