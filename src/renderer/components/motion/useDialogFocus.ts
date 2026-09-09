import { useLayoutEffect, useRef, type RefObject } from "react";

const focusableSelector = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]';

export default function useDialogFocus(panelRef: RefObject<HTMLElement | null>, close: () => void) {
  const previous = useRef(document.activeElement as HTMLElement | null);
  const initialFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const isTop = () => Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) === panel;
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(element => element.getClientRects().length > 0 && !element.closest("[inert]"));
    if (panel.contains(document.activeElement)) initialFocus.current = document.activeElement as HTMLElement;
    const focusFirst = () => {
      const items = controls();
      // Preserve React autoFocus when StrictMode replays the mount effect.
      const preferred = initialFocus.current;
      (preferred && items.includes(preferred) ? preferred : items[0] ?? panel).focus({ preventScroll: true });
    };
    if (!panel.contains(document.activeElement) && isTop()) focusFirst();
    const keyboard = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      } else if (event.key === "Tab") {
        const items = controls();
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); panel.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    const keepFocus = () => { if (isTop() && !panel.inert && !panel.contains(document.activeElement)) focusFirst(); };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("focusin", keepFocus);
      if (previous.current?.isConnected && !previous.current.closest("[inert]")) previous.current.focus({ preventScroll: true });
    };
  }, [panelRef]);
}
