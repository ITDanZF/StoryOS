export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(
        target.closest("input, textarea, select, [contenteditable='true']"),
      ))
  );
}
export function hasOpenDialog(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"], dialog[open]'));
}
