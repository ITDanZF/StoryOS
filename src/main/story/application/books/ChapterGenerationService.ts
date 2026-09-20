import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  extractTiptapText,
  plainTextToTiptapDocument,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import { chapterWriterPrompt } from "../../resources/prompts/chapterWriterPrompt.ts";
import type { ModelGateway, ModelStreamPart } from "../../../agent/model/ModelGateway.ts";
import type NovelApplication from "./NovelApplication.ts";
import type {
  ChapterGenerationEventHandler,
  ChapterGenerationMode,
} from "./chapterGenerationEvents.ts";

export const DEFAULT_CHAPTER_GENERATION_STREAM_IDLE_TIMEOUT_MS = 300_000;
export const DEFAULT_CHAPTER_GENERATION_MAX_ATTEMPTS = 3;
export const DEFAULT_CHAPTER_GENERATION_PAGE_CHARACTER_TARGET = 800;

const CHAPTER_IDLE_TIMEOUT_ENV = "MINI_AGENT_CHAPTER_IDLE_TIMEOUT_MS";
const CHAPTER_MAX_ATTEMPTS_ENV = "MINI_AGENT_CHAPTER_MAX_ATTEMPTS";
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const THINKING_PUBLISH_INTERVAL_MS = 500;
const MAX_THINKING_PREVIEW_CHARACTERS = 2_000;

class ChapterGenerationIdleTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`DeepSeek stream idle timeout after ${timeoutMs}ms.`);
    this.name = "ChapterGenerationIdleTimeoutError";
  }
}

class ChapterGenerationEmptyResponseError extends Error {
  constructor() {
    super("The chapter generator returned empty content.");
    this.name = "ChapterGenerationEmptyResponseError";
  }
}

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

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function retryDelayMs(attempt: number): number {
  const exponential = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    MAX_RETRY_DELAY_MS,
  );
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(exponential * jitter);
}

function isRetryableGenerationError(error: unknown): boolean {
  if (
    error instanceof ChapterGenerationIdleTimeoutError ||
    error instanceof ChapterGenerationEmptyResponseError
  )
    return true;
  const text = message(error);
  return /(?:timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|rate limit|429|5\d\d|server error)/i.test(
    text,
  );
}

function createAttemptScope(upstream?: AbortSignal): {
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const abortFromUpstream = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) {
    abortFromUpstream();
  } else {
    upstream?.addEventListener("abort", abortFromUpstream, { once: true });
  }
  return Object.freeze({
    controller,
    signal: controller.signal,
    dispose: () => upstream?.removeEventListener("abort", abortFromUpstream),
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Chapter generation aborted.");
}

function nextWithIdleTimeout<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
  controller: AbortController,
  timeoutMs: number,
): Promise<IteratorResult<T>> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      const error = new ChapterGenerationIdleTimeoutError(timeoutMs);
      controller.abort(error);
      finish(reject, error);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = <TValue,>(fn: (value: TValue) => void, value: TValue) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onAbort = () => finish(reject, abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    iterator.next().then(
      (result) => finish(resolve, result),
      (error: unknown) => finish(reject, error),
    );
  });
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal ? abortError(signal) : new Error("Chapter generation aborted."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
    const generate = () => this.generateWithSnapshot(input);
    return this.model.withSnapshot ? this.model.withSnapshot(generate) : generate();
  }

  private async generateWithSnapshot(input: GenerateChapterInput): Promise<GenerateChapterResult> {
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
      timestamp: new Date().toISOString(),
    });

    const maxAttempts = readPositiveIntegerEnv(
      CHAPTER_MAX_ATTEMPTS_ENV,
      DEFAULT_CHAPTER_GENERATION_MAX_ATTEMPTS,
    );
    const idleTimeoutMs = readPositiveIntegerEnv(
      CHAPTER_IDLE_TIMEOUT_ENV,
      DEFAULT_CHAPTER_GENERATION_STREAM_IDLE_TIMEOUT_MS,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const chunks: string[] = [];
      let lastActivityAt = Date.now();
      let generatedCharacterCount = 0;
      let publishedCharacterCount = 0;
      let publishedPageCount = 0;
      let thinkingText = "";
      let thinkingPending = false;
      let lastThinkingPublishedAt = 0;
      const publishThinking = async (): Promise<void> => {
        if (!thinkingPending) return;
        thinkingPending = false;
        lastThinkingPublishedAt = Date.now();
        await this.onEvent({
          ...eventBase,
          type: "chapter_generation_thinking",
          text: thinkingText,
          timestamp: new Date().toISOString(),
        });
      };
      const publishPage = async (throughCharacterCount: number): Promise<void> => {
        if (throughCharacterCount <= publishedCharacterCount) return;
        const pageText = Array.from(chunks.join(""))
          .slice(0, throughCharacterCount)
          .join("");
        if (!pageText.trim()) {
          publishedCharacterCount = throughCharacterCount;
          return;
        }
        const generatedText = pageText.trimEnd();
        const previewText = combineText(input.mode, initialText, generatedText);
        publishedPageCount += 1;
        publishedCharacterCount = throughCharacterCount;
        await this.onEvent({
          ...eventBase,
          type: "chapter_generation_page_ready",
          pageNumber: publishedPageCount,
          content: serializeTiptapDocument(plainTextToTiptapDocument(previewText)),
          generatedCharacterCount: throughCharacterCount,
          timestamp: new Date().toISOString(),
        });
      };
      const prompt = [
        `章节标题：${chapter.title}`,
        input.mode === "append"
          ? "任务：只输出需要接在现有正文之后的新正文，不要重复现有正文。"
          : "任务：输出改写后的完整章节正文。",
        initialText ? `现有正文：\n${initialText}` : "现有正文为空。",
        `写作要求：\n${input.instruction}`,
        "只输出小说正文，不要解释、标题、Markdown 代码块或工具调用。",
      ].join("\n\n");
      try {
        const attemptScope = createAttemptScope(input.signal);
        let iterator: AsyncIterator<string | ModelStreamPart> | null = null;
        let exhausted = false;
        try {
          const stream = this.model.stream({
            prompt,
            threadId: `${generationId}/model/attempt-${attempt}`,
            systemPrompt: chapterWriterPrompt,
            tools: [],
            signal: attemptScope.signal,
            maxTurns: 1,
            visibility: "internal",
          });
          iterator = stream[Symbol.asyncIterator]();
          for (;;) {
            const result = await nextWithIdleTimeout(
              iterator,
              attemptScope.signal,
              attemptScope.controller,
              idleTimeoutMs,
            );
            if (result.done) {
              exhausted = true;
              break;
            }
            const chunk = result.value;
            const isText = typeof chunk === "string";
            const text = isText ? chunk : chunk.channel === "answer" ? chunk.delta : "";
            if (!text) {
              const reasoning = !isText && chunk.channel === "reasoning" ? chunk.delta : "";
              if (reasoning) {
                lastActivityAt = Date.now();
                thinkingText = `${thinkingText}${reasoning}`.slice(
                  -MAX_THINKING_PREVIEW_CHARACTERS,
                );
                thinkingPending = true;
                if (Date.now() - lastThinkingPublishedAt >= THINKING_PUBLISH_INTERVAL_MS) {
                  await publishThinking();
                }
              } else if (Date.now() - lastActivityAt >= idleTimeoutMs) {
                throw new ChapterGenerationIdleTimeoutError(idleTimeoutMs);
              }
              continue;
            }
            lastActivityAt = Date.now();
            chunks.push(text);
            generatedCharacterCount += Array.from(text).length;
            while (
              generatedCharacterCount - publishedCharacterCount >=
                DEFAULT_CHAPTER_GENERATION_PAGE_CHARACTER_TARGET
            ) {
              await publishThinking();
              await publishPage(
                publishedCharacterCount + DEFAULT_CHAPTER_GENERATION_PAGE_CHARACTER_TARGET,
              );
            }
          }
        } finally {
          attemptScope.dispose();
          if (!exhausted && iterator?.return) {
            try {
              await iterator.return();
            } catch {
              void 0;
            }
          }
        }
        await publishThinking();
        await publishPage(generatedCharacterCount);
        const generatedText = chunks.join("").trim();
        if (!generatedText) throw new ChapterGenerationEmptyResponseError();
        const finalText = combineText(input.mode, initialText, generatedText);
        const document = plainTextToTiptapDocument(finalText);
        const content = serializeTiptapDocument(document);
        if (chapter.rowVersion === undefined) {
          throw new Error("Chapter row version is missing.");
        }
        const saved = this.novels.saveRevision({
          chapterId: chapter.id,
          content,
          characterCount: countTiptapCharacters(document),
          changeSummary: input.mode === "append" ? "AI 按页续写章节" : "AI 按页改写章节",
          expectedCurrentRevisionId: revision?.id ?? null,
          expectedRowVersion: chapter.rowVersion,
          origin: "agent",
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
        if (input.signal?.aborted) {
          await this.onEvent({
            ...eventBase,
            type: "chapter_generation_cancelled",
            timestamp: new Date().toISOString(),
          });
          throw error;
        }
        const canRetry =
          chunks.length === 0 &&
          !input.signal?.aborted &&
          attempt < maxAttempts &&
          isRetryableGenerationError(error);
        if (canRetry) {
          await this.onEvent({
            ...eventBase,
            type: "chapter_generation_retrying",
            attempt: attempt + 1,
            maxAttempts,
            reason: message(error),
            timestamp: new Date().toISOString(),
          });
          await waitForRetry(retryDelayMs(attempt), input.signal);
          continue;
        }
        await this.onEvent({
          ...eventBase,
          type: "chapter_generation_failed",
          error: message(error),
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    }
    throw new Error("Chapter generation ended without a result.");
  }
}
