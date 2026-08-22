import { useEffect, type RefObject } from "react";
import type {
  BookWorkspaceSnapshot,
  BookWorkspaceChapterDto,
  ReadyBookWorkspaceSnapshot,
} from "../../../../shared/agent/contracts.ts";
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "../editor/chapterEditorContext.ts";

type UseBookEditorToolHandlerOptions = {
  readonly projectId: string | undefined;
  readonly projectName: string | null;
  readonly workspace: ReadyBookWorkspaceSnapshot | null;
  readonly activeChapter: BookWorkspaceChapterDto | null;
  readonly chapterNumber: number | null;
  readonly volumeTitle: string;
  readonly pageNumber: number | null;
  readonly editorBridgeRef: RefObject<ChapterEditorBridge | null>;
  readonly openChapter: (chapterId: string, pageNumber: number) => void;
  readonly reloadWorkspace: () => Promise<BookWorkspaceSnapshot | null>;
};

export default function useBookEditorToolHandler({
  projectId,
  projectName,
  workspace,
  activeChapter,
  chapterNumber,
  volumeTitle,
  pageNumber,
  editorBridgeRef,
  openChapter,
  reloadWorkspace,
}: UseBookEditorToolHandlerOptions): void {
  useEffect(() => window.storyOSAgent.onEditorToolRequest(async (request) => {
    if (!projectId || request.projectId !== projectId) {
      throw new Error("The requested project is not open in this editor.");
    }
    if (!projectName || !workspace) {
      throw new Error("No project book is open in the editor.");
    }

    const operation = request.operation;
    if (operation.kind === "open_chapter") {
      let chapter = workspace.chapters.find(
        (item) => item.id === operation.chapterId,
      );
      if (!chapter) {
        const refreshed = await reloadWorkspace();
        if (refreshed?.state === "ready") {
          chapter = refreshed.chapters.find(
            (item) => item.id === operation.chapterId,
          );
        }
      }
      if (!chapter) throw new Error(`Chapter not found: ${operation.chapterId}`);
      const requestedPageNumber = operation.pageNumber ?? 1;
      openChapter(chapter.id, requestedPageNumber);
      return { chapterId: chapter.id, pageNumber: requestedPageNumber };
    }

    if (!activeChapter || chapterNumber === null) {
      throw new Error("No active book chapter is open in the editor.");
    }
    const bridge = editorBridgeRef.current;
    if (!bridge) {
      throw new Error(
        "The chapter editor is not available. Exit AI focus mode and open the chapter.",
      );
    }

    let snapshot: ChapterEditorLiveContext;
    if (operation.kind === "get_context") {
      snapshot = bridge.getContext();
    } else if (operation.kind === "inspect_text") {
      snapshot = bridge.inspectText({ queries: operation.queries });
    } else {
      if (operation.chapterId !== activeChapter.id) {
        throw new Error(
          "The active chapter changed before the editor tool could run.",
        );
      }
      switch (operation.kind) {
        case "replace_range":
          snapshot = bridge.replaceRange({
            expectedVersion: operation.expectedVersion,
            from: operation.from,
            to: operation.to,
            replacement: operation.replacement,
          });
          break;
        case "run_command":
          snapshot = bridge.runCommand({
            expectedVersion: operation.expectedVersion,
            command: operation.command,
          });
          break;
        case "set_style":
          snapshot = bridge.setStyle({
            expectedVersion: operation.expectedVersion,
            style: operation.style,
          });
          break;
        case "select_range":
          snapshot = bridge.selectRange({
            expectedVersion: operation.expectedVersion,
            range: operation.range,
          });
          break;
        case "apply_targeted_styles":
          snapshot = bridge.applyTargetedStyles({
            expectedVersion: operation.expectedVersion,
            operations: operation.operations,
          });
          break;
        case "page_operation":
          snapshot = bridge.managePage({
            expectedVersion: operation.expectedVersion,
            action: operation.action,
            ...(operation.pageNumber === undefined
              ? {}
              : { pageNumber: operation.pageNumber }),
            ...(operation.targetPageNumber === undefined
              ? {}
              : { targetPageNumber: operation.targetPageNumber }),
          });
          break;
      }
    }

    return {
      projectId,
      projectName,
      bookId: workspace.book.id,
      bookTitle: workspace.book.title,
      chapterId: activeChapter.id,
      chapterTitle: activeChapter.title,
      chapterNumber,
      volumeTitle,
      pageNumber,
      persistedRevisionNumber: activeChapter.revisionNumber,
      ...snapshot,
    };
  }), [
    activeChapter,
    chapterNumber,
    editorBridgeRef,
    openChapter,
    pageNumber,
    projectId,
    projectName,
    reloadWorkspace,
    volumeTitle,
    workspace,
  ]);
}
