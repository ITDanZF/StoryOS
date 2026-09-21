import { useEffect, useRef } from "react";
import type { ConversationApplicationEvent } from "../../../../shared/agent/contracts.ts";
import type { ChapterGenerationEvent } from "../../../../shared/contracts/books/chapterGenerationEvents.ts";
import { generationStore } from "../store/generationStore.ts";

function isChapterGenerationEvent(
  event: ConversationApplicationEvent,
): event is ConversationApplicationEvent & ChapterGenerationEvent {
  return event.type.startsWith("chapter_generation_");
}

export default function useBookGenerationEvents(
  projectId: string | undefined,
  onStarted?: (chapterId: string) => void,
): void {
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;
  useEffect(() => {
    if (!projectId) {
      generationStore.getState().reset();
      return;
    }
    const { jobs } = generationStore.getState();
    if (Object.values(jobs).some((job) => job.projectId !== projectId)) {
      generationStore.getState().reset();
    }
    return window.storyOSAgent.onEvent((event) => {
      if (!isChapterGenerationEvent(event)) return;
      if (event.projectId !== projectId) return;
      generationStore.getState().applyEvent(event);
      if (event.type === "chapter_generation_started") {
        onStartedRef.current?.(event.chapterId);
      }
    });
  }, [projectId]);
}
