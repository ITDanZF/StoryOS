import { Extension } from "@tiptap/core";
import { runEditorCommand } from "../commands/editorCommandRegistry.ts";

export type EditorShortcutOptions = {
  readonly onFind: (replace: boolean) => void;
  readonly onLink: () => void;
  readonly onSave: () => void;
};

const EditorShortcutExtension = Extension.create<EditorShortcutOptions>({
  name: "storyOSEditorShortcuts",
  priority: 1000,

  addOptions() {
    return {
      onFind: () => undefined,
      onLink: () => undefined,
      onSave: () => undefined,
    };
  },

  addKeyboardShortcuts() {
    const run = (id: Parameters<typeof runEditorCommand>[1]) => () =>
      runEditorCommand(this.editor, id);
    return {
      "Mod-b": run("bold"),
      "Mod-i": run("italic"),
      "Mod-u": run("underline"),
      "Mod-Shift-s": run("strike"),
      "Mod-l": run("alignLeft"),
      "Mod-e": run("alignCenter"),
      "Mod-r": run("alignRight"),
      "Mod-j": run("alignJustify"),
      "Mod-z": run("undo"),
      "Mod-y": run("redo"),
      "Shift-Mod-z": run("redo"),
      "Mod-Enter": run("pageBreak"),
      "Shift-Enter": run("hardBreak"),
      "Mod-s": () => {
        this.options.onSave();
        return true;
      },
      "Mod-f": () => {
        this.options.onFind(false);
        return true;
      },
      "Mod-h": () => {
        this.options.onFind(true);
        return true;
      },
      "Mod-k": () => {
        this.options.onLink();
        return true;
      },
    };
  },
});

export default EditorShortcutExtension;
