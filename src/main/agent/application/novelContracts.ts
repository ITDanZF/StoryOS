import type { ChapterStatus, NovelStatus } from "./novelPorts.ts";

export type NovelDto = {
  readonly id: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
  readonly createdAt: string;
  readonly rowVersion?: number;
  readonly updatedAt: string;
};

export type VolumeDto = {
  readonly id: string;
  readonly novelId: string;
  readonly title: string;
  readonly summary: string;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly rowVersion?: number;
  readonly updatedAt: string;
};

export type ChapterDto = {
  readonly id: string;
  readonly novelId: string;
  readonly volumeId: string | null;
  readonly title: string;
  readonly status: ChapterStatus;
  readonly sortOrder: number;
  readonly currentRevisionId: string | null;
  readonly createdAt: string;
  readonly rowVersion?: number;
  readonly updatedAt: string;
};

export type ChapterRevisionDto = {
  readonly id: string;
  readonly chapterId: string;
  readonly revisionNumber: number;
  readonly content: string;
  readonly contentHash: string;
  readonly parentRevisionId?: string | null;
  readonly textHash?: string;
  readonly extractorVersion?: number;
  readonly deviceId?: string;
  readonly origin?: "editor" | "agent" | "import" | "restore";
  readonly sourceRunId?: string;
  readonly restoredFromRevisionId?: string;
  readonly characterCount: number;
  readonly changeSummary: string;
  readonly createdAt: string;
};
