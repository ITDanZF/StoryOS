import { useEffect, useRef, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { ChapterPaginationController } from "../pagination/ChapterPaginationExtension.ts";
import type { useChapterPagination } from "../pagination/useChapterPagination.ts";
import {
  appendChapterPage,
  deleteChapterPage,
  moveChapterPage,
} from "../pagination/pageEditorCommands.ts";
import {
  clampChapterEditablePosition,
  type BookPageNavigationTarget,
} from "../../book-content/paginationModel.ts";

export default function useChapterPageCommands({
  editor,
  pageTarget,
  pagination,
  paginationController,
  activatePage,
  pendingPageNumber,
}: {
  editor: Editor | null;
  pageTarget: BookPageNavigationTarget | null;
  pagination: ReturnType<typeof useChapterPagination>;
  paginationController: ChapterPaginationController;
  activatePage: (index: number) => void;
  pendingPageNumber: RefObject<number | null>;
}) {
  const processedPageRequestId = useRef<number | null>(null);
  useEffect(() => {
    if (!editor || !pageTarget) return;
    if (processedPageRequestId.current === pageTarget.requestId) return;
    processedPageRequestId.current = pageTarget.requestId;

    if (pageTarget.kind === "append") {
      pendingPageNumber.current = pageTarget.chapterPageNumber;
      appendChapterPage(editor);
      editor.commands.focus("end");
      return;
    }

    if (pageTarget.kind === "move") {
      const snapshot = paginationController.getSnapshot();
      if (snapshot.status !== "ready") {
        processedPageRequestId.current = null;
        return;
      }
      pendingPageNumber.current = pageTarget.targetChapterPageNumber;
      moveChapterPage(
        editor,
        snapshot,
        pageTarget.sourceChapterPageNumber,
        pageTarget.targetChapterPageNumber,
      );
      return;
    }

    if (pageTarget.kind === "delete") {
      const snapshot = paginationController.getSnapshot();
      if (snapshot.status !== "ready") {
        processedPageRequestId.current = null;
        return;
      }
      pendingPageNumber.current = pageTarget.chapterPageNumber;
      deleteChapterPage(editor, snapshot, pageTarget.chapterPageNumber);
      return;
    }

    const currentSnapshot = paginationController.getSnapshot();
    if (currentSnapshot.status === "ready") {
      activatePage(pageTarget.chapterPageNumber - 1);
    } else {
      pendingPageNumber.current = pageTarget.chapterPageNumber;
    }
    const frame = window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const position = clampChapterEditablePosition(
        pageTarget.position,
        editor.state.doc.content.size,
      );
      editor.chain().focus().setTextSelection(position).run();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activatePage, editor, pageTarget, pagination, paginationController]);
}
