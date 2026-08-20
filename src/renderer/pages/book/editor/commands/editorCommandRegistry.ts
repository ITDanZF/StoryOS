import type { Editor } from "@tiptap/core";

export type EditorCommandId =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "clearFormatting"
  | "undo"
  | "redo"
  | "pageBreak"
  | "hardBreak";

export type EditorCommandDefinition = {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly shortcut?: string;
};

export const EDITOR_COMMANDS: Readonly<
  Record<EditorCommandId, EditorCommandDefinition>
> = Object.freeze({
  bold: { id: "bold", label: "加粗", shortcut: "Mod+B" },
  italic: { id: "italic", label: "斜体", shortcut: "Mod+I" },
  underline: { id: "underline", label: "下划线", shortcut: "Mod+U" },
  strike: { id: "strike", label: "删除线", shortcut: "Mod+Shift+S" },
  blockquote: { id: "blockquote", label: "引用" },
  bulletList: { id: "bulletList", label: "无序列表", shortcut: "Mod+Shift+8" },
  orderedList: { id: "orderedList", label: "有序列表", shortcut: "Mod+Shift+7" },
  alignLeft: { id: "alignLeft", label: "左对齐", shortcut: "Mod+L" },
  alignCenter: { id: "alignCenter", label: "居中", shortcut: "Mod+E" },
  alignRight: { id: "alignRight", label: "右对齐", shortcut: "Mod+R" },
  alignJustify: { id: "alignJustify", label: "两端对齐", shortcut: "Mod+J" },
  clearFormatting: { id: "clearFormatting", label: "清除格式" },
  undo: { id: "undo", label: "撤销", shortcut: "Mod+Z" },
  redo: { id: "redo", label: "重做", shortcut: "Mod+Y" },
  pageBreak: { id: "pageBreak", label: "分页符", shortcut: "Mod+Enter" },
  hardBreak: { id: "hardBreak", label: "硬换行", shortcut: "Shift+Enter" },
});

export function editorCommandLabel(id: EditorCommandId): string {
  const command = EDITOR_COMMANDS[id];
  return command.shortcut
    ? `${command.label} ${command.shortcut}`
    : command.label;
}

export function runEditorCommand(
  editor: Editor,
  id: EditorCommandId,
): boolean {
  if (editor.isDestroyed) return false;
  const chain = editor.chain().focus();
  switch (id) {
    case "bold": return chain.toggleBold().run();
    case "italic": return chain.toggleItalic().run();
    case "underline": return chain.toggleUnderline().run();
    case "strike": return chain.toggleStrike().run();
    case "blockquote": return chain.toggleBlockquote().run();
    case "bulletList": return chain.toggleBulletList().run();
    case "orderedList": return chain.toggleOrderedList().run();
    case "alignLeft": return chain.setTextAlign("left").run();
    case "alignCenter": return chain.setTextAlign("center").run();
    case "alignRight": return chain.setTextAlign("right").run();
    case "alignJustify": return chain.setTextAlign("justify").run();
    case "clearFormatting": return chain.unsetAllMarks().clearNodes().run();
    case "undo": return chain.undo().run();
    case "redo": return chain.redo().run();
    case "pageBreak":
      return chain.insertContent([
        { type: "pageBreak" },
        { type: "paragraph" },
      ]).run();
    case "hardBreak": return chain.setHardBreak().run();
  }
}
