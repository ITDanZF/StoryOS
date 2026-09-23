import { describe, expect, it } from "vitest";
import type { ModelGateway } from "../../../agent/model/ModelGateway.ts";
import type { ChapterDraft } from "../../../../shared/book/drafts.ts";
import ChapterGenerationService from "./ChapterGenerationService.ts";
import NovelApplication from "./NovelApplication.ts";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  NovelPersistence,
} from "./novelPorts.ts";

function chapterRecord(): ChapterRecord {
  return {
    id: "chapter-1",
    novelId: "book-1",
    volumeId: null,
    title: "第一章",
    status: "draft",
    sortOrder: 1,
    currentRevisionId: null,
    rowVersion: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function persistence(chapter: ChapterRecord): NovelPersistence {
  const revisions = new Map<string, ChapterRevisionRecord>();
  return {
    getChapter: () => chapter,
    getRevision: (revisionId: string) => revisions.get(revisionId) ?? null,
    saveRevision: (input) => {
      const record: ChapterRevisionRecord = {
        id: input.id,
        chapterId: input.chapterId,
        revisionNumber: revisions.size + 1,
        content: input.content,
        contentHash: input.contentHash,
        characterCount: input.characterCount,
        changeSummary: input.changeSummary,
        createdAt: new Date(),
        origin: input.origin,
      };
      revisions.set(record.id, record);
      chapter.currentRevisionId = record.id;
      return record;
    },
    saveDraft: (input): ChapterDraft => ({
      chapterId: input.chapterId,
      baseRevisionId: input.baseRevisionId,
      draftVersion: input.expectedDraftVersion + 1,
      content: input.content,
      updatedAt: new Date(0).toISOString(),
    }),
  } as NovelPersistence;
}

describe("novel revision indexing", () => {
  it("enqueues after an agent save and skips an unchanged revision and a draft", () => {
    const chapter = chapterRecord();
    const enqueued: string[] = [];
    const novels = new NovelApplication(persistence(chapter), undefined, (novelId) => {
      enqueued.push(novelId);
    });

    const saved = novels.saveRevision({
      chapterId: chapter.id,
      content: "正文",
      expectedCurrentRevisionId: null,
      expectedRowVersion: 1,
      origin: "agent",
    });
    novels.saveRevision({
      chapterId: chapter.id,
      content: "正文",
      expectedCurrentRevisionId: saved.id,
      expectedRowVersion: 1,
      origin: "agent",
    });
    novels.saveDraft({
      chapterId: chapter.id,
      baseRevisionId: saved.id,
      expectedDraftVersion: 0,
      content: "草稿",
    });

    expect(enqueued).toEqual(["book-1"]);
  });

  it("enqueues after chapter generation saves a new revision", async () => {
    const chapter = chapterRecord();
    const enqueued: string[] = [];
    const novels = new NovelApplication(persistence(chapter), undefined, (novelId) => {
      enqueued.push(novelId);
    });
    const model: ModelGateway = {
      stream: async function* stream() {
        yield { channel: "answer", delta: "生成正文" };
      },
    };
    const generation = new ChapterGenerationService(model, novels, async () => undefined);

    await generation.generate({
      projectId: "project-1",
      chapterId: chapter.id,
      mode: "rewrite",
      instruction: "写一段正文",
    });

    expect(enqueued).toEqual(["book-1"]);
  });
});
