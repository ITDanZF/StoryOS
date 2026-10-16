import { describe, expect, it } from "vitest";
import type { ModelGateway } from "../../../agent/model/ModelGateway.ts";
import ChapterGenerationService from "./ChapterGenerationService.ts";
import NovelApplication from "./NovelApplication.ts";
import type { ChapterRecord, NovelPersistence } from "./novelPorts.ts";

describe("chapter generation tools", () => {
  it("keeps the writer model call to one turn and an empty tool list", async () => {
    const chapter: ChapterRecord = {
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
    const savedRunIds: (string | undefined)[] = [];
    let currentRevisionId: string | null = null;
    const persistence = {
      getChapter: () => ({ ...chapter, currentRevisionId }),
      getRevision: (): null => null,
      saveRevision: (input: { id: string; chapterId: string; content: string; contentHash: string; characterCount: number; changeSummary: string; origin: "agent"; sourceRunId?: string }) => {
        savedRunIds.push(input.sourceRunId);
        currentRevisionId = input.id;
        return {
          id: input.id,
          chapterId: input.chapterId,
          revisionNumber: 1,
          content: input.content,
          contentHash: input.contentHash,
          characterCount: input.characterCount,
          changeSummary: input.changeSummary,
          createdAt: new Date(),
          origin: input.origin,
        };
      },
    } as unknown as NovelPersistence;
    const calls: { tools: unknown; maxTurns: number; prompt: string }[] = [];
    const model: ModelGateway = {
      async *stream(input) {
        calls.push({
          tools: input.tools,
          maxTurns: input.maxTurns,
          prompt: input.prompt,
        });
        yield { channel: "answer", delta: "生成正文" };
      },
    };
    const generation = new ChapterGenerationService(
      model,
      new NovelApplication(persistence),
      async () => undefined,
    );
    const result = await generation.generate({
      projectId: "project-1",
      chapterId: chapter.id,
      mode: "rewrite",
      instruction: "按交接写本章",
      sourceRunId: "graph-step-1",
    });
    expect(savedRunIds).toEqual(["graph-step-1"]);
    expect(result.revisionId).toBe(currentRevisionId);
    expect(calls).toEqual([
      expect.objectContaining({
        tools: [],
        maxTurns: 1,
        prompt: expect.stringContaining("按交接写本章"),
      }),
    ]);
  });
});
