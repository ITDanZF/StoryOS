import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getChapterSearchState } from "./FindReplaceExtension.ts";

type ChapterFindReplacePanelProps = {
  readonly editor: Editor;
  readonly replaceMode: boolean;
  readonly onClose: () => void;
};

export default function ChapterFindReplacePanel({
  editor,
  replaceMode,
  onClose,
}: ChapterFindReplacePanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const search = useEditorState({
    editor,
    selector: ({ editor: current }) => getChapterSearchState(current.state),
  });

  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [replaceMode]);

  const close = () => {
    editor.commands.clearChapterSearch();
    editor.commands.focus();
    onClose();
  };

  return (
    <div
      className="absolute right-4 top-3 z-50 w-[min(360px,calc(100%-32px))] rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_14px_40px_rgba(30,28,20,0.18)]"
      role="search"
      aria-label={replaceMode ? "查找和替换" : "查找"}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={searchInputRef}
          className="h-8 min-w-0 flex-1 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-800 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          value={query}
          placeholder="查找内容"
          aria-label="查找内容"
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            editor.commands.setChapterSearchQuery(value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (event.shiftKey) editor.commands.findPreviousChapterMatch();
            else editor.commands.findNextChapterMatch();
          }}
        />
        <span className="min-w-12 text-center text-[10px] tabular-nums text-neutral-400">
          {search && search.matches.length > 0
            ? `${search.activeIndex + 1}/${search.matches.length}`
            : "0/0"}
        </span>
        <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100" type="button" title="上一个（Shift+Enter）" onClick={() => editor.commands.findPreviousChapterMatch()}><ChevronUp size={14} /></button>
        <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100" type="button" title="下一个（Enter）" onClick={() => editor.commands.findNextChapterMatch()}><ChevronDown size={14} /></button>
        <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" type="button" title="关闭" aria-label="关闭查找" onClick={close}><X size={14} /></button>
      </div>

      {replaceMode && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-neutral-100 pt-2">
          <input
            className="h-8 min-w-0 flex-1 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-800 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            value={replacement}
            placeholder="替换为"
            aria-label="替换为"
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 text-[10px] text-neutral-600 hover:border-violet-200 hover:text-violet-700 disabled:opacity-40" type="button" disabled={!search || search.activeIndex < 0} onClick={() => editor.commands.replaceCurrentChapterMatch(replacement)}><Replace size={12} />替换</button>
          <button className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-[10px] text-neutral-600 hover:border-violet-200 hover:text-violet-700 disabled:opacity-40" type="button" disabled={!search || search.matches.length === 0} onClick={() => editor.commands.replaceAllChapterMatches(replacement)}>全部替换</button>
        </div>
      )}
    </div>
  );
}
