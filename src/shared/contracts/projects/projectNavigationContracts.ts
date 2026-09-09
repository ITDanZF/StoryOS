import type { NovelStatus } from "../books/novelPorts.ts";
import type { ThreadSnapshot } from "../conversations/threadContracts.ts";
import type { ProjectDto } from "./projectContracts.ts";

export type ProjectNavigationSnapshot = {
  readonly project: ProjectDto;
  readonly book: ProjectBookSummary | null;
  readonly conversations: ThreadSnapshot;
};

export type ProjectBookSummary = {
  readonly id: string;
  readonly title: string;
  readonly status: NovelStatus;
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly updatedAt: string;
};
