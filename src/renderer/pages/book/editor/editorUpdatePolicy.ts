import type { Transaction } from "@tiptap/pm/state";

export const EXTERNAL_CONTENT_META = "storyosExternalContent";

export function shouldPersistEditorTransaction(
  transaction: Pick<Transaction, "docChanged" | "getMeta">,
): boolean {
  return transaction.docChanged &&
    transaction.getMeta(EXTERNAL_CONTENT_META) !== true;
}

export function synchronizeEditorEditable(
  editor: {
    readonly isEditable: boolean;
    setEditable(editable: boolean, emitUpdate?: boolean): void;
  },
  editable: boolean,
): void {
  if (editor.isEditable !== editable) editor.setEditable(editable, false);
}
