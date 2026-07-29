import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type { BookSaveState } from "../bookWorkspaceModel.ts";
import "./chapterEditor.css";
import { createChapterEditorExtensions } from "./chapterEditorExtensions.ts";
import ChapterEditorToolbar from "./ChapterEditorToolbar.tsx";

type ChapterRichTextEditorProps = {
  readonly chapterNumber: number;
  readonly content: string;
  readonly onSave: (content: string) => Promise<void>;
  readonly onSaveStateChange: (state: BookSaveState) => void;
  readonly onCharacterCountChange: (count: number) => void;
  readonly onAskAiSelection: (selection: string | null) => void;
};

export default function ChapterRichTextEditor({
  chapterNumber,
  content,
  onSave,
  onSaveStateChange,
  onCharacterCountChange,
  onAskAiSelection,
}: ChapterRichTextEditorProps) {
  const saveTimer = useRef<number | null>(null);
  const pendingContent = useRef<string | null>(null);
  const lastSavedContent = useRef(content);
  const saveSequence = useRef(Promise.resolve());
  const onSaveRef = useRef(onSave);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onCharacterCountChangeRef = useRef(onCharacterCountChange);
  onSaveRef.current = onSave;
  onSaveStateChangeRef.current = onSaveStateChange;
  onCharacterCountChangeRef.current = onCharacterCountChange;

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
      .catch(() => {
        onSaveStateChangeRef.current("error");
      });
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingContent.current !== null) {
      persist(pendingContent.current);
    }
  }, [persist]);

  const editor = useEditor({
    extensions: createChapterEditorExtensions(),
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
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        persist(serialized);
      }, 800);
    },
    onBlur: flush,
  });

  useEffect(() => () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingContent.current;
    if (pending !== null && pending !== lastSavedContent.current) {
      void onSaveRef.current(pending);
    }
  }, []);

  const askAi = () => {
    if (!editor || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const selection = from === to
      ? null
      : editor.state.doc.textBetween(from, to, "\n").trim() || null;
    onAskAiSelection(selection);
  };

  return (
    <>
      <ChapterEditorToolbar editor={editor} onAskAi={askAi} />
      <div className="chapter-editor-canvas min-h-0 flex-1 overflow-y-auto px-[clamp(12px,4vw,56px)] pb-16 pt-[clamp(18px,4vw,40px)]">
        <div className="chapter-editor-paper mx-auto flex min-h-full w-full max-w-[840px] flex-col overflow-hidden rounded-md border bg-white">
          <EditorContent
            className="min-h-[650px] flex-1"
            editor={editor}
          />
          <footer className="chapter-editor-footer flex items-center justify-between border-t px-6 py-4 text-[10px]">
            <span>第 {chapterNumber} 章</span>
            <span>StoryOS 自动保存已开启</span>
          </footer>
        </div>
      </div>
    </>
  );
}
