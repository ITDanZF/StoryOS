import { useEffect, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "./chapterEditorContext.ts";
import type { ChapterPaginationController } from "../pagination/ChapterPaginationExtension.ts";
import {
  appendChapterPage,
  deleteChapterPage,
  moveChapterPage,
} from "../pagination/pageEditorCommands.ts";
import { runEditorCommand } from "./commands/editorCommandRegistry.ts";
import {
  inspectEditorText,
  resolveEditorTargetSelector,
} from "./ai/richTextTargeting.ts";
import { buildEditorStyleTransaction } from "./ai/richTextTransactions.ts";

export default function useChapterEditorBridge(
  editor: Editor | null,
  documentVersionRef: RefObject<number>,
  getContext: (editor: Editor) => ChapterEditorLiveContext,
  flush: () => Promise<void>,
  paginationController: ChapterPaginationController,
  activatePage: (index: number) => void,
  pendingPageNumber: RefObject<number | null>,
  onBridgeChangeRef: RefObject<(bridge: ChapterEditorBridge | null) => void>,
) {
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
          editor.state.tr
            .setSelection(
              TextSelection.create(
                editor.state.doc,
                resolved.from,
                resolved.to,
              ),
            )
            .scrollIntoView(),
        );
        editor.view.focus();
        return getContext(editor);
      },
      replaceRange: ({ expectedVersion, from, to, replacement }) => {
        requireVersion(expectedVersion);
        const maximum = editor.state.doc.content.size;
        if (from < 0 || to < from || to > maximum) {
          throw new Error(
            `Invalid editor range: ${from}-${to} (max ${maximum}).`,
          );
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
        if (selection.empty)
          throw new Error("The active editor selection is empty.");
        const expectedText = editor.state.doc.textBetween(
          selection.from,
          selection.to,
          "\n",
          "\n",
        );
        const result = buildEditorStyleTransaction(editor.state, [
          {
            selector: { kind: "selection", expectedText },
            style,
          },
        ]);
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
            throw new Error(
              "Source and target page numbers are required for moving a page.",
            );
          }
          moveChapterPage(editor, snapshot, pageNumber, targetPageNumber);
        }
        return getContext(editor);
      },
    };
    onBridgeChangeRef.current(bridge);
    return () => onBridgeChangeRef.current(null);
  }, [editor, getContext, paginationController]);
}
