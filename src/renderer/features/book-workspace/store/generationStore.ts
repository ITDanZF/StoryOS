import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { ChapterGenerationEvent } from "../../../../shared/contracts/books/chapterGenerationEvents.ts";
import type { NovelMutation } from "../../../../shared/contracts/books/novelEvents.ts";
import type { ChapterGenerationView } from "../../agent/types.ts";

export type GenerationStartedReveal = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly generationId: string;
};

export type GenerationStoreState = {
  readonly jobs: Readonly<Record<string, ChapterGenerationView>>;
  readonly lastStarted: GenerationStartedReveal | null;
  readonly applyEvent: (event: ChapterGenerationEvent) => void;
  readonly reset: () => void;
};

export function applyChapterGenerationEvent(
  jobs: Readonly<Record<string, ChapterGenerationView>>,
  event: ChapterGenerationEvent,
): Readonly<Record<string, ChapterGenerationView>> {
  if (event.type === "chapter_generation_started") {
    return {
      ...jobs,
      [event.chapterId]: {
        generationId: event.generationId,
        projectId: event.projectId,
        chapterId: event.chapterId,
        mode: event.mode,
        status: "generating",
        thinkingText: "",
        publishedPageCount: 0,
        generatedCharacterCount: 0,
        updatedAt: event.timestamp,
      },
    };
  }

  const existing = jobs[event.chapterId];
  if (!existing || existing.generationId !== event.generationId) return jobs;

  if (event.type === "chapter_generation_thinking") {
    return {
      ...jobs,
      [event.chapterId]: {
        ...existing,
        thinkingText: event.text,
        updatedAt: event.timestamp,
      },
    };
  }

  if (event.type === "chapter_generation_page_ready") {
    return {
      ...jobs,
      [event.chapterId]: {
        ...existing,
        previewContent: event.content,
        publishedPageCount: event.pageNumber,
        generatedCharacterCount: event.generatedCharacterCount,
        status: "generating",
        updatedAt: event.timestamp,
      },
    };
  }

  if (event.type === "chapter_generation_retrying") {
    return {
      ...jobs,
      [event.chapterId]: {
        ...existing,
        thinkingText: "",
        retryAttempt: event.attempt,
        retryMaxAttempts: event.maxAttempts,
        status: "generating",
        updatedAt: event.timestamp,
      },
    };
  }

  if (event.type === "chapter_generation_completed") {
    return {
      ...jobs,
      [event.chapterId]: {
        ...existing,
        status: "completed",
        previewContent: event.content,
        revisionNumber: event.revisionNumber,
        characterCount: event.characterCount,
        updatedAt: event.timestamp,
      },
    };
  }

  if (event.type === "chapter_generation_cancelled") {
    return {
      ...jobs,
      [event.chapterId]: {
        ...existing,
        status: "cancelled",
        updatedAt: event.timestamp,
      },
    };
  }

  if (event.type !== "chapter_generation_failed") return jobs;

  return {
    ...jobs,
    [event.chapterId]: {
      ...existing,
      status: "failed",
      error: event.error,
      updatedAt: event.timestamp,
    },
  };
}

export function chapterIdToRevealFromMutation(
  mutation: NovelMutation,
  jobs: Readonly<Record<string, ChapterGenerationView>>,
): string | null {
  if (!mutation.chapterId) return null;
  if (mutation.kind === "chapter_created") return mutation.chapterId;
  if (mutation.kind !== "chapter_revision_saved") return null;
  const job = jobs[mutation.chapterId];
  if (job?.status === "generating") return null;
  if (
    job?.status === "completed" &&
    mutation.revisionNumber !== undefined &&
    mutation.revisionNumber === job.revisionNumber
  ) {
    return null;
  }
  return mutation.chapterId;
}

export function selectGenerationJob(
  jobs: Readonly<Record<string, ChapterGenerationView>>,
  chapterId: string | null,
): ChapterGenerationView | null {
  if (!chapterId) return null;
  return jobs[chapterId] ?? null;
}

const emptyState = {
  jobs: {} as Readonly<Record<string, ChapterGenerationView>>,
  lastStarted: null as GenerationStartedReveal | null,
};

export function createGenerationStore() {
  return createStore<GenerationStoreState>()((set, get) => ({
    ...emptyState,
    applyEvent: (event) => {
      const jobs = applyChapterGenerationEvent(get().jobs, event);
      set({
        jobs,
        lastStarted: event.type === "chapter_generation_started"
          ? {
              projectId: event.projectId,
              chapterId: event.chapterId,
              generationId: event.generationId,
            }
          : get().lastStarted,
      });
    },
    reset: () => set(emptyState),
  }));
}

export type GenerationStore = ReturnType<typeof createGenerationStore>;

export const generationStore = createGenerationStore();

export function useGenerationJob(
  chapterId: string | null,
  store: GenerationStore = generationStore,
): ChapterGenerationView | null {
  return useStore(store, (state) => selectGenerationJob(state.jobs, chapterId));
}

export function useGenerationJobs(
  store: GenerationStore = generationStore,
): Readonly<Record<string, ChapterGenerationView>> {
  return useStore(store, (state) => state.jobs);
}
