import { useEffect, useLayoutEffect, useState } from "react";
import useResizablePanel from "../../components/layout/useResizablePanel.ts";
import { hasOpenDialog, isEditableTarget } from "../../lib/keyboard.ts";

export default function useBookWorkspaceLayout() {
  const [container, containerRef] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(window.innerWidth);
  const [catalogVisible, setCatalogVisible] = useState(true);
  const [assistantVisible, setAssistantVisible] = useState(true);
  const [assistantFocused, setAssistantFocused] = useState(false);
  const catalog = useResizablePanel({
    initial: 248,
    min: 216,
    max: 360,
    direction: 1,
    storageKey: "storyos:book-catalog-width",
  });
  const assistant = useResizablePanel({
    initial: Math.round(window.innerWidth * 0.29),
    min: 300,
    max: Math.min(560, available - (catalogVisible ? catalog.width : 0) - 426),
    direction: -1,
    storageKey: "storyos:book-assistant-width",
  });
  // The route can initially render a loading state. Run when its actual container appears.
  useLayoutEffect(() => {
    const element = container;
    if (!element) return;
    const update = () => setAvailable(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        hasOpenDialog() ||
        isEditableTarget(event.target)
      )
        return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      )
        return;
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCatalogVisible((value) => !value);
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAssistantVisible((value) => !value);
        setAssistantFocused(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return {
    containerRef,
    catalog,
    assistant,
    catalogVisible,
    setCatalogVisible,
    assistantVisible,
    setAssistantVisible,
    assistantFocused,
    setAssistantFocused,
  };
}
