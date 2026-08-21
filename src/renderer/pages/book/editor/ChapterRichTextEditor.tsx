import type { Content, Editor } from "@tiptap/core";
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
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "./chapterEditorContext.ts";
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
  readonly onContextChange: (context: ChapterEditorLiveContext) => void;
  readonly onBridgeChange: (bridge: ChapterEditorBridge | null) => void;
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
  onContextChange,
  onBridgeChange,
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
  const onContextChangeRef = useRef(onContextChange);
  const onBridgeChangeRef = useRef(onBridgeChange);
  const documentVersionRef = useRef(0);
  onSaveRef.current = onSave;
  onSaveStateChangeRef.current = onSaveStateChange;
  onCharacterCountChangeRef.current = onCharacterCountChange;
  onPageChangeRef.current = onPageChange;
  onContextChangeRef.current = onContextChange;
  onBridgeChangeRef.current = onBridgeChange;

  const getContext = useCallback((current: Editor): ChapterEditorLiveContext => {
    const { from, to } = current.state.selection;
    const selectionText = from === to
      ? ""
      : current.state.doc.textBetween(from, to, "\n", "\n").trim();
    return {
      version: documentVersionRef.current,
      documentText: current.state.doc.textBetween(
        0,
        current.state.doc.content.size,
        "\n\n",
        "\n",
      ),
      selection: from !== to && selectionText
        ? { from, to, text: selectionText }
        : null,
    };
  }, []);

  const publishContext = useCallback((current: Editor) => {
    onContextChangeRef.current(getContext(current));
  }, [getContext]);

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
      publishContext(current);
    },
    onUpdate: ({ editor: current }) => {
      documentVersionRef.current += 1;
      const document = current.getJSON();
      const serialized = serializeTiptapDocument(document);
      pendingContent.current = serialized;
      onCharacterCountChangeRef.current(countTiptapCharacters(document));
      onSaveStateChangeRef.current("saving");
      publishContext(current);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        persist(serialized);
      }, 800);
    },
    onSelectionUpdate: ({ editor: current }) => {
      documentVersionRef.current += 1;
      publishContext(current);
      const snapshot = paginationController.getSnapshot();
      if (snapshot.status !== "ready") return;
      activatePage(chapterPageAtPosition(
        snapshot,
        current.state.selection.from,
      ));
    },
    onBlur: flush,
  }, [flush, openFind, paginationController, publishContext]);

  const pagination = useChapterPagination(
    paginationController,
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const requireVersion = (expectedVersion: number) => {
      if (expectedVersion !== documentVersionRef.current) {
        throw new Error(
          `Editor version conflict: expected ${expectedVersion}, current ${documentVersionRef.current}.`,
        );
      }
    };
    const bridge: ChapterEditorBridge = {
      getContext: () => getContext(editor),
      replaceRange: ({ expectedVersion, from, to, replacement }) => {
        requireVersion(expectedVersion);
        const maximum = editor.state.doc.content.size;
        if (from < 0 || to < from || to > maximum) {
          throw new Error(`Invalid editor range: ${from}-${to} (max ${maximum}).`);
        }
        const transaction = replacement
          ? editor.state.tr.insertText(replacement, from, to)
          : editor.state.tr.deleteRange(from, to);
        editor.view.dispatch(transaction.scrollIntoView());
        return getContext(editor);
      },
      runCommand: ({ expectedVersion, command }) => {
        requireVersion(expectedVersion);
        if (!runEditorCommand(editor, command)) {
          throw new Error(`Editor command could not run: ${command}`);
        }
        return getContext(editor);
      },
      setStyle: ({ expectedVersion, style }) => {
        requireVersion(expectedVersion);
        if (style.kind === "text_color") {
          const chain = editor.chain().focus();
          const changed = style.value
            ? chain.setColor(style.value).run()
            : chain.unsetColor().run();
          if (!changed) throw new Error("Text color could not be applied.");
        } else if (style.kind === "background_color") {
          const chain = editor.chain().focus();
          const changed = style.value
            ? chain.setBackgroundColor(style.value).run()
            : chain.unsetBackgroundColor().run();
          if (!changed) throw new Error("Background color could not be applied.");
        } else if (style.kind === "link") {
          if (style.href && !/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(style.href.trim())) {
            throw new Error("Only safe HTTP(S), mail, telephone, anchor, or relative links are allowed.");
          }
          const chain = editor.chain().focus().extendMarkRange("link");
          const changed = style.href
            ? chain.setLink({ href: style.href.trim() }).run()
            : chain.unsetLink().run();
          if (!changed) throw new Error("Link style could not be applied.");
        } else {
          const format = {
            ...(style.lineHeight === undefined
              ? {}
              : { lineHeight: style.lineHeight }),
            ...(style.firstLineIndent === undefined
              ? {}
              : { firstLineIndent: style.firstLineIndent ? "2em" : null }),
          };
          if (Object.keys(format).length > 0 &&
            !editor.commands.setParagraphFormat(format)) {
            throw new Error("Paragraph format could not be applied.");
          }
          if (style.indentDelta !== undefined &&
            !editor.commands.adjustParagraphIndent(style.indentDelta)) {
            throw new Error("Paragraph indentation could not be applied.");
          }
        }
        return getContext(editor);
      },
      managePage: ({
        expectedVersion,
        action,
        pageNumber,
        targetPageNumber,
      }) => {
        requireVersion(expectedVersion);
        const snapshot = paginationController.getSnapshot();
        if (snapshot.status !== "ready") {
          throw new Error("Chapter pagination is not ready.");
        }
        if (action === "append") {
          appendChapterPage(editor);
        } else if (action === "delete") {
          if (pageNumber === undefined) {
            throw new Error("Page number is required for deletion.");
          }
          deleteChapterPage(editor, snapshot, pageNumber);
        } else {
          if (pageNumber === undefined || targetPageNumber === undefined) {
            throw new Error("Source and target page numbers are required for moving a page.");
          }
          moveChapterPage(editor, snapshot, pageNumber, targetPageNumber);
        }
        return getContext(editor);
      },
    };
    onBridgeChangeRef.current(bridge);
    return () => onBridgeChangeRef.current(null);
  }, [editor, getContext, paginationController]);

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
