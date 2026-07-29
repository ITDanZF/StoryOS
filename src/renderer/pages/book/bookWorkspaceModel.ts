import type { BookWorkspaceChapterDto } from "../../../shared/agent/contracts.ts";

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

export function countCharacters(value: string): number {
  return Array.from(value.replace(/\s/g, "")).length;
}
