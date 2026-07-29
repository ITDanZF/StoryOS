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

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

export function formatChineseOrdinal(value: number, unit: "卷" | "章"): string {
  const integer = Math.max(1, Math.floor(value));
  let number: string;
  if (integer < 10) {
    number = CHINESE_DIGITS[integer];
  } else if (integer < 20) {
    number = `十${integer % 10 ? CHINESE_DIGITS[integer % 10] : ""}`;
  } else if (integer < 100) {
    number = `${CHINESE_DIGITS[Math.floor(integer / 10)]}十${integer % 10 ? CHINESE_DIGITS[integer % 10] : ""}`;
  } else {
    number = integer.toLocaleString("zh-CN");
  }
  return `第${number}${unit}`;
}
