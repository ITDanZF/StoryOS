import { useEffect } from "react";

/** Keep management-dialog focus separate from the menu portal's lifetime. */
export default function useBookshelfDialogFocus(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const topDialog = () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).at(-1);
    const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0);
    const dialog = topDialog();
    if (dialog) { dialog.tabIndex = -1; (focusable(dialog)[0] ?? dialog).focus(); }
    const keyboard = (event: KeyboardEvent) => {
      const current = topDialog();
      if (!current) return;
      if (event.key === "Escape") {
        const close = current.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
        if (close && !close.disabled) { event.preventDefault(); event.stopPropagation(); close.click(); }
      } else if (event.key === "Tab") {
        const items = focusable(current);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); current.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => { document.removeEventListener("keydown", keyboard, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [active]);
}
