import { useState } from "react";
import type {
  BookTransferFormatCapability,
  BookshelfBookCard,
  ExportBookResult,
  ExportPreview,
  ExportBookOptions,
} from "../../../../shared/agent/contracts.ts";

type ReadyBook = Extract<BookshelfBookCard, { availability: "ready" }>;

type ExportState =
  | { readonly phase: "choose-format" }
  | { readonly phase: "preparing"; readonly format: BookTransferFormatCapability }
  | { readonly phase: "destination"; readonly format: BookTransferFormatCapability; readonly preview: ExportPreview }
  | { readonly phase: "exporting"; readonly format: BookTransferFormatCapability; readonly preview: ExportPreview }
  | { readonly phase: "success"; readonly result: ExportBookResult }
  | { readonly phase: "error"; readonly format: BookTransferFormatCapability; readonly preview: ExportPreview | null; readonly message: string };

const DEFAULT_OPTIONS: ExportBookOptions = {
  includeTitlePage: true,
  includeSynopsis: true,
  includeVolumeSummaries: true,
  includeTableOfContents: true,
  chapterPageBreaks: true,
  markdownBundle: false,
  splitTextFiles: false,
};

function exportErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
}

export default function useBookExportFlow(book: ReadyBook) {
  const [state, setState] = useState<ExportState>({ phase: "choose-format" });

  const selectFormat = async (format: BookTransferFormatCapability) => {
    if (!format.canExport) return;
    setState({ phase: "preparing", format });
    try {
      const preview = await window.storyOSAgent.prepareBookshelfBookExport({
        bookId: book.bookId,
        format: format.id,
        options: DEFAULT_OPTIONS,
      });
      setState({ phase: "destination", format, preview });
    } catch (cause) {
      setState({ phase: "error", format, preview: null, message: exportErrorMessage(cause) });
    }
  };
  const commit = async (outputPath: string) => {
    if (state.phase !== "destination") return;
    const { format, preview } = state;
    setState({ phase: "exporting", format, preview });
    try {
      // commit is called only after the native save dialog accepts the destination.
      const result = await window.storyOSAgent.commitBookshelfBookExport({
        exportId: preview.exportId,
        outputPath,
        overwrite: true,
      });
      await window.storyOSWindow.rememberTransferLocation(outputPath);
      setState({ phase: "success", result });
    } catch (cause) {
      setState({ phase: "error", format, preview, message: exportErrorMessage(cause) });
    }
  };
  const back = async () => {
    if (state.phase === "destination" || state.phase === "exporting") {
      await window.storyOSAgent.cancelBookshelfBookExport(state.preview.exportId);
      setState({ phase: "choose-format" });
      return;
    }
    if (state.phase === "error" && state.preview) {
      await window.storyOSAgent.cancelBookshelfBookExport(state.preview.exportId);
    }
    if (state.phase === "preparing" || state.phase === "error") {
      setState({ phase: "choose-format" });
    }
  };
  const dispose = async () => {
    if (state.phase === "destination" || state.phase === "exporting" || (state.phase === "error" && state.preview)) {
      await window.storyOSAgent.cancelBookshelfBookExport(state.preview.exportId);
    }
  };
  return { state, selectFormat, commit, back, dispose };
}
