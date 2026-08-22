import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import NovelApplication from "../../src/main/agent/application/NovelApplication.ts";
import ProjectDatabase from "../../src/main/agent/storage/project/ProjectDatabase.ts";
import SqliteNovelStore from "../../src/main/agent/storage/project/SqliteNovelStore.ts";
import BookToolContext from "../../src/main/agent/tools/book/BookToolContext.ts";
import { createBookReadTools } from "../../src/main/agent/tools/book/readBook.ts";
import { createBookMutationTools } from "../../src/main/agent/tools/book/mutateBook.ts";
import ToolPolicy from "../../src/main/agent/security/ToolPolicy.ts";
import type { RegisteredTool } from "../../src/main/agent/tools/ToolResolver.ts";
import { serializeTiptapDocument } from "../../src/shared/book/richText.ts";
import ChapterGenerationService from "../../src/main/agent/book-generation/ChapterGenerationService.ts";
import type { ChapterGenerationEvent } from "../../src/main/agent/application/chapterGenerationEvents.ts";
import type { ModelGateway } from "../../src/main/agent/model/ModelGateway.ts";

const roots: string[] = [];
const databases: ProjectDatabase[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-book-tools-"));
  roots.push(root);
  const database = new ProjectDatabase(path.join(root, "storyos.sqlite"));
  databases.push(database);
  const novels = new NovelApplication(new SqliteNovelStore(database.handle));
  const book = novels.createNovel({ title: "旧城雨夜" });
  const volume = novels.createVolume({
    novelId: book.id,
    title: "第一卷",
    sortOrder: 0,
  });
  const chapter = novels.createChapter({
    novelId: book.id,
    volumeId: volume.id,
    title: "雨夜",
    status: "draft",
    sortOrder: 0,
  });
  novels.saveRevision({
    chapterId: chapter.id,
    content: serializeTiptapDocument({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "雨落在旧城，林川推开了门。" }],
      }],
    }),
    characterCount: 13,
    changeSummary: "初稿",
    expectedCurrentRevisionId: null,
  });
  const context = new BookToolContext("project-story", novels);
  const tools = [
    ...createBookReadTools(context),
    ...createBookMutationTools(context),
  ];
  return {
    book,
    volume,
    chapter,
    novels,
    tools: Object.fromEntries(
      tools.map((item) => [item.name, item]),
    ) as Record<string, RegisteredTool>,
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("book read tools", () => {
  it("streams generated prose and commits exactly one final revision", async () => {
    const { chapter, novels } = createHarness();
    const events: ChapterGenerationEvent[] = [];
    const model: ModelGateway = {
      async *stream() {
        yield "门外站着";
        yield "一个陌生人。";
      },
    };
    const generation = new ChapterGenerationService(
      model,
      novels,
      (event) => {
        events.push(event);
      },
    );

    const result = await generation.generate({
      projectId: "project-story",
      chapterId: chapter.id,
      mode: "append",
      instruction: "续写陌生人来访。",
    });

    expect(result.revisionNumber).toBe(2);
    expect(novels.listRevisions(chapter.id)).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual([
      "chapter_generation_started",
      "chapter_generation_delta",
      "chapter_generation_completed",
    ]);
    expect(events[1]).toMatchObject({
      sequence: 1,
      text: "门外站着一个陌生人。",
    });
    expect(novels.getCurrentRevision(chapter.id)?.content)
      .toContain("门外站着一个陌生人");
  });

  it("keeps canonical content unchanged when generation fails", async () => {
    const { chapter, novels } = createHarness();
    const originalRevision = novels.getCurrentRevision(chapter.id);
    const events: ChapterGenerationEvent[] = [];
    const model: ModelGateway = {
      async *stream() {
        yield "未完成的增量";
        throw new Error("model disconnected");
      },
    };
    const generation = new ChapterGenerationService(
      model,
      novels,
      (event) => {
        events.push(event);
      },
    );

    await expect(generation.generate({
      projectId: "project-story",
      chapterId: chapter.id,
      mode: "append",
      instruction: "继续写。",
    })).rejects.toThrow("model disconnected");

    expect(novels.listRevisions(chapter.id)).toHaveLength(1);
    expect(novels.getCurrentRevision(chapter.id)?.id).toBe(originalRevision?.id);
    expect(events.at(-1)).toMatchObject({
      type: "chapter_generation_failed",
      error: "model disconnected",
    });
  });

  it("rejects a final write when the chapter changes during generation", async () => {
    const { chapter, novels } = createHarness();
    const model: ModelGateway = {
      async *stream() {
        yield "AI 正在续写。";
        const current = novels.getCurrentRevision(chapter.id);
        novels.saveRevision({
          chapterId: chapter.id,
          content: serializeTiptapDocument({
            type: "doc",
            content: [{
              type: "paragraph",
              content: [{ type: "text", text: "用户在生成期间保存的内容。" }],
            }],
          }),
          expectedCurrentRevisionId: current?.id ?? null,
        });
      },
    };
    const events: ChapterGenerationEvent[] = [];
    const generation = new ChapterGenerationService(
      model,
      novels,
      (event) => {
        events.push(event);
      },
    );

    await expect(generation.generate({
      projectId: "project-story",
      chapterId: chapter.id,
      mode: "append",
      instruction: "继续写。",
    })).rejects.toThrow("Chapter revision conflict");

    expect(novels.listRevisions(chapter.id)).toHaveLength(2);
    expect(novels.getCurrentRevision(chapter.id)?.content)
      .toContain("用户在生成期间保存的内容");
    expect(events.at(-1)?.type).toBe("chapter_generation_failed");
  });

  it("reads the outline and persisted chapter text", async () => {
    const { chapter, tools } = createHarness();
    const outline = JSON.parse(String(await tools.get_book_outline.invoke({}))) as {
      volumes: readonly { chapters: readonly { id: string }[] }[];
    };
    expect(outline.volumes[0].chapters[0].id).toBe(chapter.id);

    const result = JSON.parse(String(await tools.read_book_chapter.invoke({
      chapter_id: chapter.id,
    }))) as { text: string; revision: { revisionNumber: number } };
    expect(result.text).toContain("林川推开了门");
    expect(result.revision.revisionNumber).toBe(1);
  });

  it("searches all persisted chapters and reports statistics", async () => {
    const { tools } = createHarness();
    const search = JSON.parse(String(await tools.search_book_chapters.invoke({
      query: "林川",
    }))) as { matches: readonly { snippet: string }[] };
    expect(search.matches).toHaveLength(1);
    expect(search.matches[0].snippet).toContain("旧城");

    const statistics = JSON.parse(String(await tools.get_book_statistics.invoke({}))) as {
      chapterCount: number;
      characterCount: number;
    };
    expect(statistics).toMatchObject({ chapterCount: 1, characterCount: 13 });
  });

  it("creates and updates book structure behind approval-gated tools", async () => {
    const { tools } = createHarness();
    const created = JSON.parse(String(await tools.create_book_volume.invoke({
      title: "第二卷",
      summary: "转折",
      sort_order: 1,
    }))) as { value: { id: string } };
    const updated = JSON.parse(String(await tools.update_book_volume.invoke({
      volume_id: created.value.id,
      title: "第二卷·迷城",
      summary: "新的转折",
      sort_order: 0,
    }))) as { value: { title: string; sortOrder: number } };

    expect(updated.value).toMatchObject({
      title: "第二卷·迷城",
      sortOrder: 0,
    });
    const policy = new ToolPolicy();
    expect(policy.getPermission("get_book_outline")).toBe("allow");
    expect(policy.getPermission("create_book_volume")).toBe("ask");
    expect(policy.getPermission("delete_book_chapter")).toBe("ask");
  });

  it("reorders occupied volume and chapter positions transactionally", async () => {
    const { book, volume, chapter, novels, tools } = createHarness();
    const secondVolume = novels.createVolume({
      novelId: book.id,
      title: "第二卷",
      sortOrder: 1,
    });
    const secondChapter = novels.createChapter({
      novelId: book.id,
      volumeId: volume.id,
      title: "晨光",
      status: "outline",
      sortOrder: 1,
    });

    await tools.update_book_volume.invoke({
      volume_id: secondVolume.id,
      title: secondVolume.title,
      summary: secondVolume.summary,
      sort_order: 0,
    });
    await tools.update_book_chapter.invoke({
      chapter_id: secondChapter.id,
      volume_id: secondVolume.id,
      title: secondChapter.title,
      status: secondChapter.status,
      sort_order: 0,
    });

    expect(novels.listVolumes(book.id).map((item) => item.id)).toEqual([
      secondVolume.id,
      volume.id,
    ]);
    expect(novels.listChapters(book.id).map((item) => item.id)).toEqual([
      secondChapter.id,
      chapter.id,
    ]);
    expect(novels.getChapter(secondChapter.id)).toMatchObject({
      volumeId: secondVolume.id,
      sortOrder: 0,
    });
    expect(novels.getChapter(chapter.id)).toMatchObject({ sortOrder: 0 });

    const insertedVolume = JSON.parse(String(await tools.create_book_volume.invoke({
      title: "序卷",
      summary: "开端",
      sort_order: 0,
    }))) as { value: { id: string } };
    expect(novels.listVolumes(book.id).map((item) => item.sortOrder)).toEqual([
      0,
      1,
      2,
    ]);
    await tools.delete_book_volume.invoke({ volume_id: insertedVolume.value.id });
    expect(novels.listVolumes(book.id).map((item) => item.sortOrder)).toEqual([
      0,
      1,
    ]);
  });
});
