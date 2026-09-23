import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import BookDatabase from "../../storage/book/BookDatabase.ts";
import type { CreateNodeInput } from "../../../../shared/contracts/outline/outlineContracts.ts";

export type OutlineBook = {
  readonly directory: string;
  readonly database: BookDatabase;
  readonly projectId: string;
  readonly bookId: string;
  readonly chapterId: string;
  readonly revisionId: string;
  close(): void;
};

export function openOutlineBook(): OutlineBook {
  const directory = mkdtempSync(path.join(tmpdir(), "storyos-outline-"));
  const database = new BookDatabase(path.join(directory, "book.sqlite"));
  const now = Date.now();
  const bookId = `book_${randomUUID()}`;
  const chapterId = `chapter_${randomUUID()}`;
  const revisionId = `revision_${randomUUID()}`;
  database.handle
    .prepare(
      "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
    )
    .run(bookId, now, now);
  database.handle
    .prepare(
      "INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at) VALUES (?, ?, '第一章', 'draft', 1, ?, ?)",
    )
    .run(chapterId, bookId, now, now);
  database.handle
    .prepare(
      `INSERT INTO chapter_revisions(
        id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
        character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
      ) VALUES (?, ?, 1, NULL, 'document-hash', 'text-hash', 1, 4, 'editor', 'device', NULL, NULL, '保存', ?)`,
    )
    .run(revisionId, chapterId, now);
  database.handle
    .prepare(
      "INSERT INTO revision_documents(revision_id, document_schema_version, document_json, plain_text) VALUES (?, 1, ?, ?)",
    )
    .run(revisionId, '{"type":"doc"}', "正文");
  database.handle
    .prepare("UPDATE chapters SET current_revision_id = ? WHERE id = ?")
    .run(revisionId, chapterId);
  return {
    directory,
    database,
    projectId: "project-1",
    bookId,
    chapterId,
    revisionId,
    close() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function eventNode(overrides: Partial<CreateNodeInput> = {}): CreateNodeInput {
  return {
    parentId: null,
    kind: "event",
    title: "夜探",
    summary: "短摘要",
    structuralRole: "rising_action",
    narrativeFunction: "action",
    goal: "找到信",
    conflict: "守门人不让进",
    outcome: "从侧门离开",
    locationText: "城门",
    timeText: "夜里",
    storyOrder: 1000,
    narrativeOrder: 1000,
    status: "confirmed",
    notes: "",
    participants: [
      {
        participantName: "阿青",
        role: "active",
        stateBefore: "在城外",
        stateAfter: "进了城",
      },
    ],
    ...overrides,
  };
}
