import { useLayoutEffect, useState } from "react";
import useResizablePanel from "../../components/layout/useResizablePanel.ts";

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
