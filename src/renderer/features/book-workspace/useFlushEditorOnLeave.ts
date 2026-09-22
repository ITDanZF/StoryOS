import { useEffect, type RefObject } from "react";
import { useBlocker } from "react-router-dom";
import type { ChapterEditorBridge } from "./editor/chapterEditorContext.ts";

export default function useFlushEditorOnLeave(
  editorBridgeRef: RefObject<ChapterEditorBridge | null>,
) {
  const settingsBlocker = useBlocker(
    ({ nextLocation }) =>
      Boolean(editorBridgeRef.current) &&
      ["/settings", "/developer"].includes(nextLocation.pathname),
  );
  useEffect(() => {
    if (settingsBlocker.state !== "blocked") return;
    const bridge = editorBridgeRef.current;
    if (!bridge) {
      settingsBlocker.reset();
      return;
    }
    void bridge
      .flushPending()
      .then(() => settingsBlocker.proceed())
      .catch(() => settingsBlocker.reset()); // The chapter save hook displays the persistence error.
  }, [editorBridgeRef, settingsBlocker]);
}
