import useChapterPageCommands from "./useChapterPageCommands.ts";
import useChapterEditorBridge from "./useChapterEditorBridge.ts";
import useChapterPersistence from "./useChapterPersistence.ts";
import type { ChapterDraft } from "../../../../shared/book/drafts.ts";
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
import { ChapterPaginationController } from "../pagination/ChapterPaginationExtension.ts";
import PaginatedEditorSurface from "../pagination/PaginatedEditorSurface.tsx";
import {
  type BookPageNavigationTarget,
  type LiveChapterPage,
} from "../../book-content/paginationModel.ts";
import {
  chapterPageAtPosition,
  useChapterPagination,
} from "../pagination/useChapterPagination.ts";
import "./chapterEditor.css";
import { createChapterEditorExtensions } from "./chapterEditorExtensions.ts";
import ChapterEditorToolbar from "./ChapterEditorToolbar.tsx";
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
  readonly initialDraft?: ChapterDraft | null;
  readonly onSaveDraft?: (
    content: string,
    baseRevisionId: string | null,
  ) => Promise<void>;
  readonly chapterNumber: number;
  readonly aiPreviewActive: boolean;
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
  initialDraft,
  onSaveDraft,
  aiPreviewActive,
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
  const [draftConflict, setDraftConflict] = useState(
    Boolean(initialDraft && initialDraft.baseRevisionId !== currentRevisionId),
  );
  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [linkRequestId, setLinkRequestId] = useState(0);
  const pendingPageNumber = useRef<number | null>(null);
  const publishedLayoutKey = useRef<string | null>(null);
  const appliedRevisionIdRef = useRef(currentRevisionId);
  const persistence = useChapterPersistence(content, currentRevisionId, initialDraft, {
    save: onSave, saveDraft: onSaveDraft, onState: onSaveStateChange,
  });
  const flush = persistence.flush;
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onCharacterCountChangeRef = useRef(onCharacterCountChange);
  const onPageChangeRef = useRef(onPageChange);
  const onContextChangeRef = useRef(onContextChange);
  const onBridgeChangeRef = useRef(onBridgeChange);
  const documentVersionRef = useRef(0);
  onSaveStateChangeRef.current = onSaveStateChange;
  onCharacterCountChangeRef.current = onCharacterCountChange;
  onPageChangeRef.current = onPageChange;
  onContextChangeRef.current = onContextChange;
  onBridgeChangeRef.current = onBridgeChange;

  const getContext = useCallback(
    (current: Editor): ChapterEditorLiveContext => {
      const { doc } = current.state;
      const { from, to } = current.state.selection;
      const selectionText =
        from === to
          ? ""
          : doc.textBetween(from, to, "\n", "\n").trim();
      let documentText: string | null = null;
      return {
        version: documentVersionRef.current,
        get documentText() {
          documentText ??= doc.textBetween(0, doc.content.size, "\n\n", "\n");
          return documentText;
        },
        selection:
          from !== to && selectionText
            ? { from, to, text: selectionText }
            : null,
      };
    },
    [],
  );

  const publishContext = useCallback(
    (current: Editor) => {
      onContextChangeRef.current(getContext(current));
    },
    [getContext],
  );

  const openFind = useCallback((replace: boolean) => {
    setReplaceMode(replace);
    setFindOpen(true);
  }, []);

  const activatePage = useCallback(
    (requestedIndex: number) => {
      const pageCount = Math.max(
        1,
        paginationController.getSnapshot().pages.length,
      );
      const nextIndex = Math.max(0, Math.min(requestedIndex, pageCount - 1));
      setActivePageIndex(nextIndex);
      onPageChangeRef.current(nextIndex + 1);
    },
    [paginationController],
  );

  const editor = useEditor(
    {
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
        previewContent ?? persistence.recoveredContent ?? content,
      ) as unknown as Content,
      editable: !aiPreviewActive && !draftConflict,
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
        persistence.schedule(serialized);
        onCharacterCountChangeRef.current(countTiptapCharacters(document));
        publishContext(current);
      },
      onSelectionUpdate: ({ editor: current }) => {
        documentVersionRef.current += 1;
        publishContext(current);
        const snapshot = paginationController.getSnapshot();
        if (snapshot.status !== "ready") return;
        activatePage(
          chapterPageAtPosition(snapshot, current.state.selection.from),
        );
      },
      onBlur: () => {
        void flush().catch((): void => undefined);
      },
    },
    [flush, openFind, paginationController, publishContext],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    synchronizeEditorEditable(editor, !aiPreviewActive && !draftConflict);
  }, [aiPreviewActive, draftConflict, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const displayedContent = previewContent ?? content;
    const editorContent = serializeTiptapDocument(editor.getJSON());
    if (previewContent !== null) {
      if (displayedContent === editorContent) return;
      persistence.cancelScheduledSave();
      applyExternalContent(editor, displayedContent);
      documentVersionRef.current += 1;
      onCharacterCountChangeRef.current(countTiptapCharacters(editor.getJSON()));
      onSaveStateChangeRef.current("saved");
      publishContext(editor);
      return;
    }
    if (displayedContent === editorContent) {
      persistence.acceptExternal(content, currentRevisionId);
      persistence.pendingContent = null;
      appliedRevisionIdRef.current = currentRevisionId;
      return;
    }
    const hasUnsavedLocalChange = persistence.hasUnsavedChanges;
    const revisionChanged = appliedRevisionIdRef.current !== currentRevisionId;
    if (hasUnsavedLocalChange && !revisionChanged) return;

    persistence.cancelScheduledSave();
    applyExternalContent(editor, displayedContent);
    persistence.acceptExternal(content, currentRevisionId);
    persistence.pendingContent = null;
    appliedRevisionIdRef.current = currentRevisionId;
    documentVersionRef.current += 1;
    onCharacterCountChangeRef.current(countTiptapCharacters(editor.getJSON()));
    onSaveStateChangeRef.current("saved");
    publishContext(editor);
  }, [content, currentRevisionId, editor, previewContent, publishContext]);

  const pagination = useChapterPagination(paginationController);

  useChapterEditorBridge(editor, documentVersionRef, getContext, flush, paginationController, activatePage, pendingPageNumber, onBridgeChangeRef);

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
      activatePage(
        Math.min(requestedPageNumber - 1, pagination.pages.length - 1),
      );
      return;
    }
    activatePage(Math.min(activePageIndex, pagination.pages.length - 1));
  }, [activatePage, activePageIndex, pagination]);

  useChapterPageCommands({ editor, pageTarget, pagination, paginationController, activatePage, pendingPageNumber });

  const askAi = () => {
    if (!editor || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const selection =
      from === to
        ? null
        : editor.state.doc.textBetween(from, to, "\n").trim() || null;
    onAskAiSelection(selection);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {draftConflict && initialDraft && (
        <div
          role="status"
          className="motion-reveal flex flex-wrap items-center gap-3 bg-warning-surface px-4 py-2 text-xs text-warning-text"
        >
          <span>有尚未提交的草稿，正文已在其他位置更新。</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(initialDraft.content);
            }}
          >
            复制草稿
          </button>
          <button
            type="button"
            onClick={() => {
              if (!editor) return;
              applyExternalContent(editor, initialDraft.content);
              persistence.pendingContent = initialDraft.content;
              setDraftConflict(false);
              onSaveStateChangeRef.current("saving");
            }}
          >
            以草稿继续编辑（保留正文历史）
          </button>
        </div>
      )}
      {persistence.recoveredContent &&
        !draftConflict &&
        persistence.pendingContent !== null && (
          <div
            role="status"
            className="motion-reveal bg-success-surface px-4 py-2 text-xs text-success-text"
          >
            已恢复未提交草稿，按 Ctrl+S 保存。
          </div>
        )}
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
        navigationPageIndex={
          pageTarget
            ? (pageTarget.kind === "move"
                ? pageTarget.targetChapterPageNumber
                : pageTarget.chapterPageNumber) - 1
            : null
        }
        onActivePageChange={activatePage}
      />
    </div>
  );
}
