import type { NovelStatus } from "./novelPorts.ts";
import type { ProjectDto } from "./projectContracts.ts";
import type { ThreadSnapshot } from "./threadContracts.ts";

export type ProjectBookSummary = {
  readonly id: string;
  readonly title: string;
  readonly status: NovelStatus;
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly updatedAt: string;
};

export type ProjectNavigationSnapshot = {
  readonly project: ProjectDto;
  readonly book: ProjectBookSummary | null;
  readonly conversations: ThreadSnapshot;
};
