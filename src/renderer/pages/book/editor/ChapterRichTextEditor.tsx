import type { Content, Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
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
import { inspectEditorText, resolveEditorTargetSelector } from "./ai/richTextTargeting.ts";
import { buildEditorStyleTransaction } from "./ai/richTextTransactions.ts";
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "./chapterEditorContext.ts";
import ChapterFindReplacePanel from "./search/ChapterFindReplacePanel.tsx";
import {
  EXTERNAL_CONTENT_META,
  shouldPersistEditorTransaction,
  synchronizeEditorEditable,
} from "./editorUpdatePolicy.ts";

type ChapterRichTextEditorProps = {
  readonly chapterNumber: number;
  readonly aiGenerating: boolean;
  readonly content: string;
  readonly previewContent: string | null;
  readonly currentRevisionId: string | null;
  readonly pageTarget: BookPageNavigationTarget | null;
  readonly onPageChange: (chapterPageNumber: number) => void;
  readonly onPaginationChange?: (
    layoutKey: string,
    pages: readonly LiveChapterPage[],
  ) => void;
  readonly onSave: (
    content: string,
    expectedCurrentRevisionId: string | null,
  ) => Promise<{ readonly revision: { readonly id: string } }>;
  readonly onSaveStateChange: (state: BookSaveState) => void;
  readonly onCharacterCountChange: (count: number) => void;
  readonly onAskAiSelection: (selection: string | null) => void;
  readonly onContextChange: (context: ChapterEditorLiveContext) => void;
  readonly onBridgeChange: (bridge: ChapterEditorBridge | null) => void;
};

function applyExternalContent(editor: Editor, serialized: string): boolean {
  const document = decodeStoredChapterContent(serialized);
  const nextDocument = editor.schema.nodeFromJSON(document);
  const start = editor.state.doc.content.findDiffStart(nextDocument.content);
  if (start === null) return false;
  const end = editor.state.doc.content.findDiffEnd(nextDocument.content) ?? {
    a: editor.state.doc.content.size,
    b: nextDocument.content.size,
  };
  editor.view.dispatch(
    editor.state.tr
      .replace(start, end.a, nextDocument.slice(start, end.b))
      .setMeta(EXTERNAL_CONTENT_META, true)
      .setMeta("preventUpdate", true)
      .setMeta("addToHistory", false),
  );
  return true;
}

export default function ChapterRichTextEditor({
  chapterNumber,
  aiGenerating,
  content,
  previewContent,
  currentRevisionId,
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
  const lastSavedRevisionId = useRef(currentRevisionId);
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

  const persist = useCallback((serialized: string): Promise<void> => {
    if (serialized === lastSavedContent.current) {
      pendingContent.current = null;
      onSaveStateChangeRef.current("saved");
      return Promise.resolve();
    }
    onSaveStateChangeRef.current("saving");
    saveSequence.current = saveSequence.current
      .catch((): void => undefined)
      .then(() => onSaveRef.current(
        serialized,
        lastSavedRevisionId.current,
      ))
      .then((result) => {
        lastSavedContent.current = serialized;
        lastSavedRevisionId.current = result.revision.id;
        if (pendingContent.current === serialized) {
          pendingContent.current = null;
          onSaveStateChangeRef.current("saved");
        }
      })
      .catch((error: unknown) => {
        onSaveStateChangeRef.current("error");
        throw error;
      });
    return saveSequence.current;
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    return pendingContent.current !== null
      ? persist(pendingContent.current)
      : saveSequence.current;
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
        onSave: () => {
          void flush().catch((): void => undefined);
        },
      },
    }),
    content: decodeStoredChapterContent(
      previewContent ?? content,
    ) as unknown as Content,
    editable: !aiGenerating,
    editorProps: {
      attributes: {
        class: "chapter-rich-text chapter-pagination-layout-root",
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
    onUpdate: ({ editor: current, transaction }) => {
      if (!shouldPersistEditorTransaction(transaction)) return;
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
        void persist(serialized).catch((): void => undefined);
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
    onBlur: () => {
      void flush().catch((): void => undefined);
    },
  }, [flush, openFind, paginationController, publishContext]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    synchronizeEditorEditable(editor, !aiGenerating);
  }, [aiGenerating, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const displayedContent = previewContent ?? content;
    const editorContent = serializeTiptapDocument(editor.getJSON());
    if (displayedContent === editorContent) {
      if (previewContent === null) {
        lastSavedContent.current = content;
        lastSavedRevisionId.current = currentRevisionId;
      }
      return;
    }
    const hasUnsavedLocalChange = pendingContent.current !== null &&
      pendingContent.current !== lastSavedContent.current;
    if (hasUnsavedLocalChange) return;

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    applyExternalContent(editor, displayedContent);
    if (previewContent === null) {
      lastSavedContent.current = content;
      lastSavedRevisionId.current = currentRevisionId;
      pendingContent.current = null;
    }
    documentVersionRef.current += 1;
    onCharacterCountChangeRef.current(countTiptapCharacters(editor.getJSON()));
    onSaveStateChangeRef.current("saved");
    publishContext(editor);
  }, [content, currentRevisionId, editor, previewContent, publishContext]);

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
      flushPending: flush,
      getContext: () => getContext(editor),
      inspectText: ({ queries }) => ({
        ...getContext(editor),
        inspections: inspectEditorText(editor.state.doc, queries),
      }),
      selectRange: ({ expectedVersion, range }) => {
        requireVersion(expectedVersion);
        const [resolved] = resolveEditorTargetSelector(
          editor.state.doc,
          editor.state.selection,
          { kind: "ranges", ranges: [range] },
        );
        editor.view.dispatch(
          editor.state.tr.setSelection(TextSelection.create(
            editor.state.doc,
            resolved.from,
            resolved.to,
          )).scrollIntoView(),
        );
        editor.view.focus();
        return getContext(editor);
      },
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
        const selection = editor.state.selection;
        if (selection.empty) throw new Error("The active editor selection is empty.");
        const expectedText = editor.state.doc.textBetween(
          selection.from,
          selection.to,
          "\n",
          "\n",
        );
        const result = buildEditorStyleTransaction(editor.state, [{
          selector: { kind: "selection", expectedText },
          style,
        }]);
        editor.view.dispatch(result.transaction.scrollIntoView());
        return getContext(editor);
      },
      applyTargetedStyles: ({ expectedVersion, operations }) => {
        requireVersion(expectedVersion);
        const result = buildEditorStyleTransaction(editor.state, operations);
        editor.view.dispatch(result.transaction.scrollIntoView());
        return {
          ...getContext(editor),
          appliedTargetCount: result.targetCount,
          appliedOperationCount: result.operations.length,
          appliedOperations: result.operations.map((operation, index) => ({
            index,
            targetCount: operation.ranges.length,
            ranges: operation.ranges,
          })),
        };
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
      void onSaveRef.current(pending, lastSavedRevisionId.current);
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
