import type { Content } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type { BookSaveState } from "../bookWorkspaceModel.ts";
import {
  ChapterPaginationController,
} from "../pagination/ChapterPaginationExtension.ts";
import PaginatedEditorSurface from "../pagination/PaginatedEditorSurface.tsx";
import {
  appendChapterPage,
  deleteChapterPage,
  moveChapterPage,
} from "../pagination/pageEditorCommands.ts";
import {
  clampChapterEditablePosition,
  type BookPageNavigationTarget,
  type LiveChapterPage,
} from "../pagination/paginationModel.ts";
import {
  chapterPageAtPosition,
  useChapterPagination,
} from "../pagination/useChapterPagination.ts";
import "./chapterEditor.css";
import { createChapterEditorExtensions } from "./chapterEditorExtensions.ts";
import ChapterEditorToolbar from "./ChapterEditorToolbar.tsx";
import { runEditorCommand } from "./commands/editorCommandRegistry.ts";
import ChapterFindReplacePanel from "./search/ChapterFindReplacePanel.tsx";

type ChapterRichTextEditorProps = {
  readonly chapterNumber: number;
  readonly content: string;
  readonly pageTarget: BookPageNavigationTarget | null;
  readonly onPageChange: (chapterPageNumber: number) => void;
  readonly onPaginationChange?: (
    layoutKey: string,
    pages: readonly LiveChapterPage[],
  ) => void;
  readonly onSave: (content: string) => Promise<void>;
  readonly onSaveStateChange: (state: BookSaveState) => void;
  readonly onCharacterCountChange: (count: number) => void;
  readonly onAskAiSelection: (selection: string | null) => void;
};

export default function ChapterRichTextEditor({
  chapterNumber,
  content,
  pageTarget,
  onPageChange,
  onPaginationChange,
  onSave,
  onSaveStateChange,
  onCharacterCountChange,
  onAskAiSelection,
}: ChapterRichTextEditorProps) {
  const paginationController = useMemo(
    () => new ChapterPaginationController(),
    [],
  );
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [linkRequestId, setLinkRequestId] = useState(0);
  const pendingPageNumber = useRef<number | null>(null);
  const processedPageRequestId = useRef<number | null>(null);
  const publishedLayoutKey = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingContent = useRef<string | null>(null);
  const lastSavedContent = useRef(content);
  const saveSequence = useRef(Promise.resolve());
  const onSaveRef = useRef(onSave);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onCharacterCountChangeRef = useRef(onCharacterCountChange);
  const onPageChangeRef = useRef(onPageChange);
  onSaveRef.current = onSave;
  onSaveStateChangeRef.current = onSaveStateChange;
  onCharacterCountChangeRef.current = onCharacterCountChange;
  onPageChangeRef.current = onPageChange;

  const persist = useCallback((serialized: string) => {
    if (serialized === lastSavedContent.current) {
      pendingContent.current = null;
      onSaveStateChangeRef.current("saved");
      return;
    }
    onSaveStateChangeRef.current("saving");
    saveSequence.current = saveSequence.current
      .catch((): void => undefined)
      .then(() => onSaveRef.current(serialized))
      .then(() => {
        lastSavedContent.current = serialized;
        if (pendingContent.current === serialized) {
          pendingContent.current = null;
          onSaveStateChangeRef.current("saved");
        }
      })
      .catch(() => onSaveStateChangeRef.current("error"));
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingContent.current !== null) persist(pendingContent.current);
  }, [persist]);

  const openFind = useCallback((replace: boolean) => {
    setReplaceMode(replace);
    setFindOpen(true);
  }, []);

  const activatePage = useCallback((requestedIndex: number) => {
    const pageCount = Math.max(
      1,
      paginationController.getSnapshot().pages.length,
    );
    const nextIndex = Math.max(0, Math.min(requestedIndex, pageCount - 1));
    setActivePageIndex(nextIndex);
    onPageChangeRef.current(nextIndex + 1);
  }, [paginationController]);

  const editor = useEditor({
    extensions: createChapterEditorExtensions({
      paginationController,
      shortcuts: {
        onFind: openFind,
        onLink: () => setLinkRequestId((current) => current + 1),
        onSave: flush,
      },
    }),
    content: decodeStoredChapterContent(content) as unknown as Content,
    editorProps: {
      attributes: {
        class: "chapter-rich-text",
        "aria-label": "章节正文",
        spellcheck: "false",
      },
    },
    onCreate: ({ editor: current }) => {
      onCharacterCountChangeRef.current(
        countTiptapCharacters(current.getJSON()),
      );
    },
    onUpdate: ({ editor: current }) => {
      const document = current.getJSON();
      const serialized = serializeTiptapDocument(document);
      pendingContent.current = serialized;
      onCharacterCountChangeRef.current(countTiptapCharacters(document));
      onSaveStateChangeRef.current("saving");
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        persist(serialized);
      }, 800);
    },
    onSelectionUpdate: ({ editor: current }) => {
      const snapshot = paginationController.getSnapshot();
      if (snapshot.status !== "ready") return;
      activatePage(chapterPageAtPosition(
        snapshot,
        current.state.selection.from,
      ));
    },
    onBlur: flush,
  }, [flush, openFind, paginationController]);

  const pagination = useChapterPagination(
    paginationController,
  );

  useEffect(() => {
    if (!editor || pagination.status !== "ready" || !onPaginationChange) return;
    if (publishedLayoutKey.current === pagination.layoutKey) return;
    publishedLayoutKey.current = pagination.layoutKey;
    onPaginationChange(
      pagination.layoutKey,
      pagination.pages.map((page) => ({
        ...page,
        previewText: editor.state.doc
          .textBetween(page.from, page.to, "\n", "\n")
          .trim(),
      })),
    );
  }, [editor, onPaginationChange, pagination]);

  useEffect(() => {
    if (pagination.status !== "ready") return;
    const requestedPageNumber = pendingPageNumber.current;
    if (requestedPageNumber !== null) {
      pendingPageNumber.current = null;
      activatePage(Math.min(
        requestedPageNumber - 1,
        pagination.pages.length - 1,
      ));
      return;
    }
    activatePage(Math.min(activePageIndex, pagination.pages.length - 1));
  }, [activatePage, activePageIndex, pagination]);

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
      deleteChapterPage(
        editor,
        snapshot,
        pageTarget.chapterPageNumber,
      );
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

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    const pending = pendingContent.current;
    if (pending !== null && pending !== lastSavedContent.current) {
      void onSaveRef.current(pending);
    }
  }, []);

  const insertPageBreak = () => {
    if (!editor || editor.isDestroyed) return;
    runEditorCommand(editor, "pageBreak");
  };

  const askAi = () => {
    if (!editor || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const selection = from === to
      ? null
      : editor.state.doc.textBetween(from, to, "\n").trim() || null;
    onAskAiSelection(selection);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ChapterEditorToolbar
        editor={editor}
        linkRequestId={linkRequestId}
        onAskAi={askAi}
        onOpenFind={() => openFind(false)}
      />
      {editor && findOpen && (
        <ChapterFindReplacePanel
          editor={editor}
          replaceMode={replaceMode}
          onClose={() => setFindOpen(false)}
        />
      )}
      <PaginatedEditorSurface
        editor={editor}
        chapterNumber={chapterNumber}
        snapshot={pagination}
        activePageIndex={activePageIndex}
        navigationRequestId={pageTarget?.requestId ?? null}
        navigationPageIndex={pageTarget
          ? (pageTarget.kind === "move"
            ? pageTarget.targetChapterPageNumber
            : pageTarget.chapterPageNumber) - 1
          : null}
        onActivePageChange={activatePage}
        onInsertPageBreak={insertPageBreak}
      />
    </div>
  );
}
