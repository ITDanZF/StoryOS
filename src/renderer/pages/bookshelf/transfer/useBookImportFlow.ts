import { useState } from "react";
import type {
  BookTransferFormatCapability,
  ImportBookResult,
  ImportPreview,
} from "../../../../shared/agent/contracts.ts";

type ImportState =
  | { readonly phase: "choose-format" }
  | { readonly phase: "browse"; readonly format: BookTransferFormatCapability; readonly filePath: string | null }
  | { readonly phase: "inspecting"; readonly format: BookTransferFormatCapability; readonly filePath: string }
  | { readonly phase: "preview"; readonly format: BookTransferFormatCapability; readonly preview: ImportPreview }
  | { readonly phase: "importing"; readonly format: BookTransferFormatCapability; readonly preview: ImportPreview }
  | { readonly phase: "success"; readonly result: ImportBookResult }
  | { readonly phase: "error"; readonly format: BookTransferFormatCapability; readonly filePath: string | null; readonly message: string };

export default function useBookImportFlow(onImported: (result: ImportBookResult) => Promise<void> | void) {
  const [state, setState] = useState<ImportState>({ phase: "choose-format" });

  const selectFormat = (format: BookTransferFormatCapability) => {
    if (!format.canImport) return;
    setState({ phase: "browse", format, filePath: null });
  };

  const inspect = async (filePath: string) => {
    if (state.phase !== "browse" && state.phase !== "error") return;
    const format = state.format;
    setState({ phase: "inspecting", format, filePath });
    try {
      await window.storyOSWindow.rememberTransferLocation(filePath);
      const preview = await window.storyOSAgent.prepareBookshelfBookImport({
        filePath,
        expectedFormat: format.id === "epub" || format.id === "pdf" ? undefined : format.id,
      });
      setState({ phase: "preview", format, preview });
    } catch (cause) {
      setState({ phase: "error", format, filePath, message: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const commit = async () => {
    if (state.phase !== "preview") return;
    const { format, preview } = state;
    setState({ phase: "importing", format, preview });
    try {
      const result = await window.storyOSAgent.commitBookshelfBookImport({ sessionId: preview.sessionId });
      await onImported(result);
      setState({ phase: "success", result });
    } catch (cause) {
      setState({ phase: "error", format, filePath: null, message: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const back = async () => {
    if (state.phase === "preview" || state.phase === "importing") {
      await window.storyOSAgent.cancelBookshelfBookImport(state.preview.sessionId);
      setState({ phase: "browse", format: state.format, filePath: null });
      return;
    }
    if (state.phase === "browse" || state.phase === "inspecting" || state.phase === "error") {
      setState({ phase: "choose-format" });
    }
  };

  const dispose = async () => {
    if (state.phase === "preview" || state.phase === "importing") {
      await window.storyOSAgent.cancelBookshelfBookImport(state.preview.sessionId);
    }
  };

  return { state, selectFormat, inspect, commit, back, dispose };
}
