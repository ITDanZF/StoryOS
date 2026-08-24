import type NovelApplication from "../application/NovelApplication.ts";
import type {
  ChapterGenerationEventHandler,
  ChapterGenerationMode,
} from "../application/chapterGenerationEvents.ts";
import type { ModelGateway } from "../model/ModelGateway.ts";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  extractTiptapText,
  plainTextToTiptapDocument,
  serializeTiptapDocument,
} from "../../../shared/book/richText.ts";

export type GenerateChapterInput = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly mode: ChapterGenerationMode;
  readonly instruction: string;
  readonly signal?: AbortSignal;
};

export type GenerateChapterResult = {
  readonly generationId: string;
  readonly chapterId: string;
  readonly revisionNumber: number;
  readonly characterCount: number;
  readonly generatedCharacterCount: number;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function combineText(
  mode: ChapterGenerationMode,
  initialText: string,
  generatedText: string,
): string {
  if (mode === "rewrite" || !initialText.trim()) return generatedText;
  return `${initialText.trimEnd()}\n\n${generatedText.trimStart()}`;
}

export default class ChapterGenerationService {
  constructor(
    private readonly model: ModelGateway,
    private readonly novels: NovelApplication,
    private readonly onEvent: ChapterGenerationEventHandler,
  ) {}

  async generate(input: GenerateChapterInput): Promise<GenerateChapterResult> {
    const generationId = `chapter_generation_${crypto.randomUUID()}`;
    const chapter = this.novels.getChapter(input.chapterId);
    const revision = this.novels.getCurrentRevision(chapter.id);
    const initialText = revision
      ? extractTiptapText(decodeStoredChapterContent(revision.content))
      : "";
    const eventBase = {
      generationId,
      projectId: input.projectId,
      chapterId: chapter.id,
    } as const;

    await this.onEvent({
      ...eventBase,
      type: "chapter_generation_started",
      mode: input.mode,
      initialText,
      timestamp: new Date().toISOString(),
    });

    const chunks: string[] = [];
    let sequence = 0;
    let pendingDelta = "";
    let lastDeltaAt = Date.now();
    const flushDelta = async (): Promise<void> => {
      if (!pendingDelta) return;
      const text = pendingDelta;
      pendingDelta = "";
      sequence += 1;
      lastDeltaAt = Date.now();
      await this.onEvent({
        ...eventBase,
        type: "chapter_generation_delta",
        sequence,
        text,
        timestamp: new Date().toISOString(),
      });
    };
    try {
      const prompt = [
        `章节标题：${chapter.title}`,
        input.mode === "append"
          ? "任务：只输出需要接在现有正文之后的新正文，不要重复现有正文。"
          : "任务：输出改写后的完整章节正文。",
        initialText ? `现有正文：\n${initialText}` : "现有正文为空。",
        `写作要求：\n${input.instruction}`,
        "只输出小说正文，不要解释、标题、Markdown 代码块或工具调用。",
      ].join("\n\n");
      for await (const chunk of this.model.stream({
        prompt,
        threadId: `${generationId}/model`,
        systemPrompt: "你是 StoryOS 的章节正文写作引擎。严格按照要求生成连贯、可直接保存的中文小说正文。",
        tools: [],
        signal: input.signal,
        maxTurns: 1,
        visibility: "internal",
      })) {
        const text = typeof chunk === "string"
          ? chunk
          : chunk.channel === "answer"
            ? chunk.delta
            : "";
        if (!text) continue;
        chunks.push(text);
        pendingDelta += text;
        if (Date.now() - lastDeltaAt >= 60) await flushDelta();
      }
      await flushDelta();

      const generatedText = chunks.join("").trim();
      if (!generatedText) throw new Error("The chapter generator returned empty content.");
      const finalText = combineText(input.mode, initialText, generatedText);
      const document = plainTextToTiptapDocument(finalText);
      const content = serializeTiptapDocument(document);
      const saved = this.novels.saveRevision({
        chapterId: chapter.id,
        content,
        characterCount: countTiptapCharacters(document),
        changeSummary: input.mode === "append" ? "AI 流式续写章节" : "AI 流式生成章节",
        expectedCurrentRevisionId: revision?.id ?? null,
      });
      await this.onEvent({
        ...eventBase,
        type: "chapter_generation_completed",
        revisionNumber: saved.revisionNumber,
        content,
        characterCount: saved.characterCount,
        timestamp: new Date().toISOString(),
      });
      return Object.freeze({
        generationId,
        chapterId: chapter.id,
        revisionNumber: saved.revisionNumber,
        characterCount: saved.characterCount,
        generatedCharacterCount: Array.from(generatedText).length,
      });
    } catch (error) {
      await this.onEvent({
        ...eventBase,
        type: "chapter_generation_failed",
        error: message(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}
