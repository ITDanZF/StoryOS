import type { ChapterStatus, NovelStatus } from "../../application/books/novelPorts.ts";
export type NovelRow = {
  id: string;
  title: string;
  synopsis: string;
  status: NovelStatus;
  created_at: number;
  updated_at: number;
  row_version: number;
};
export type VolumeRow = {
  id: string;
  book_id: string;
  title: string;
  summary: string;
  position: number;
  created_at: number;
  updated_at: number;
  row_version: number;
};
export type ChapterRow = {
  id: string;
  book_id: string;
  volume_id: string | null;
  title: string;
  status: ChapterStatus;
  position: number;
  current_revision_id: string | null;
  created_at: number;
  updated_at: number;
  row_version: number;
};
export type RevisionRow = {
  id: string;
  chapter_id: string;
  revision_number: number;
  content: string;
  document_hash: string;
  parent_revision_id: string | null;
  text_hash: string;
  extractor_version: number;
  device_id: string;
  origin: "editor" | "agent" | "import" | "restore";
  source_run_id: string | null;
  restored_from_revision_id: string | null;
  character_count: number;
  change_summary: string;
  created_at: number;
};
