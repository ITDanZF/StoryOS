import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../shared/agent/contracts.ts";
export type BookSaveState = "saved" | "saving" | "error";

export type BookChapterGroup = {
  readonly key: string;
  readonly kind: "volume" | "unassigned";
  readonly volume: VolumeDto | null;
  readonly title: string;
  readonly chapters: readonly BookWorkspaceChapterDto[];
};

export type BookChapterLocation = {
  readonly group: BookChapterGroup;
  readonly chapter: BookWorkspaceChapterDto;
  readonly chapterIndex: number;
  readonly chapterNumber: number;
};

export const UNASSIGNED_CHAPTER_GROUP_KEY = "unassigned";

function compareByOrderThenId(
  left: { readonly sortOrder: number; readonly id: string },
  right: { readonly sortOrder: number; readonly id: string },
): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

export function createBookChapterGroups(
  volumes: readonly VolumeDto[],
  chapters: readonly BookWorkspaceChapterDto[],
): readonly BookChapterGroup[] {
  const orderedVolumes = [...volumes].sort(compareByOrderThenId);
  const volumeIds = new Set(orderedVolumes.map((volume) => volume.id));
  const chaptersByVolume = new Map<string, BookWorkspaceChapterDto[]>();
  const unassigned: BookWorkspaceChapterDto[] = [];

  for (const chapter of chapters) {
    if (chapter.volumeId === null) {
      unassigned.push(chapter);
      continue;
    }
    if (!volumeIds.has(chapter.volumeId)) {
      throw new Error(
        `Chapter ${chapter.id} references unknown volume ${chapter.volumeId}.`,
      );
    }
    const siblings = chaptersByVolume.get(chapter.volumeId) ?? [];
    siblings.push(chapter);
    chaptersByVolume.set(chapter.volumeId, siblings);
  }

  const groups: BookChapterGroup[] = orderedVolumes.map((volume) => ({
    key: `volume:${volume.id}`,
    kind: "volume",
    volume,
    title: volume.title,
    chapters: Object.freeze(
      [...(chaptersByVolume.get(volume.id) ?? [])].sort(compareByOrderThenId),
    ),
  }));
  if (unassigned.length > 0) {
    groups.push({
      key: UNASSIGNED_CHAPTER_GROUP_KEY,
      kind: "unassigned",
      volume: null,
      title: "未分卷",
      chapters: Object.freeze([...unassigned].sort(compareByOrderThenId)),
    });
  }
  return Object.freeze(groups);
}

export function flattenBookChapterGroups(
  groups: readonly BookChapterGroup[],
): readonly BookWorkspaceChapterDto[] {
  return Object.freeze(groups.flatMap((group) => group.chapters));
}

export function findBookChapterLocation(
  groups: readonly BookChapterGroup[],
  chapterId: string | null,
): BookChapterLocation | null {
  if (!chapterId) return null;
  for (const group of groups) {
    const chapterIndex = group.chapters.findIndex(
      (chapter) => chapter.id === chapterId,
    );
    if (chapterIndex >= 0) {
      return {
        group,
        chapter: group.chapters[chapterIndex],
        chapterIndex,
        chapterNumber: chapterIndex + 1,
      };
    }
  }
  return null;
}

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
