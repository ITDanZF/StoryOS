import { describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_CONTENT_META,
  shouldPersistEditorTransaction,
  synchronizeEditorEditable,
} from "./editorUpdatePolicy.ts";

describe("editor update policy", () => {
  it("does not emit an update when synchronizing editable state", () => {
    const setEditable = vi.fn();
    synchronizeEditorEditable({ isEditable: true, setEditable }, false);
    expect(setEditable).toHaveBeenCalledWith(false, false);

    setEditable.mockClear();
    synchronizeEditorEditable({ isEditable: false, setEditable }, false);
    expect(setEditable).not.toHaveBeenCalled();
  });

  it("persists only user document changes", () => {
    expect(shouldPersistEditorTransaction({
      docChanged: false,
      getMeta: () => undefined,
    })).toBe(false);
    expect(shouldPersistEditorTransaction({
      docChanged: true,
      getMeta: (key) => key === EXTERNAL_CONTENT_META ? true : undefined,
    })).toBe(false);
    expect(shouldPersistEditorTransaction({
      docChanged: true,
      getMeta: () => undefined,
    })).toBe(true);
  });
});
