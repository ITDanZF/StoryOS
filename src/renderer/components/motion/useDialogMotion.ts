import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animateMotion } from "./motion.ts";

/** Animate the shell's dimensions rather than scaling its text during step changes. */
export default function useDialogMotion(stage: string | number = "default") {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousSize = useRef<DOMRect | null>(null);
  const resizeAnimation = useRef<Animation | null>(null);
  const animations = useRef(new Set<Animation>());
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  const animate = (...args: Parameters<typeof animateMotion>) => {
    const animation = animateMotion(...args);
    animations.current.add(animation);
    void animation.finished.catch(() => { /* A new step or unmount can cancel this animation. */ }).finally(() => animations.current.delete(animation));
    return animation;
  };

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay || closingRef.current) return;
    const previous = resizeAnimation.current?.playState === "running"
      ? panel.getBoundingClientRect() : previousSize.current;
    resizeAnimation.current?.cancel();
    const next = panel.getBoundingClientRect();
    previousSize.current = next;

    if (!previous) {
      animate(overlay, [{ opacity: 0 }, { opacity: 1 }], "fade");
      animate(panel, [{ transform: "translateY(16px)" }, { transform: "translateY(0)" }], "enter");
    } else if (previous.width !== next.width || previous.height !== next.height) {
      resizeAnimation.current = animate(panel, [
        { width: `${previous.width}px`, maxWidth: `${previous.width}px`, height: `${previous.height}px` },
        { width: `${next.width}px`, maxWidth: `${next.width}px`, height: `${next.height}px` },
      ], "resize");
    }
    if (contentRef.current) {
      animate(contentRef.current, [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], "content");
    }
    // Removed step controls must not leave keyboard focus behind on the page body.
    if (previous && !panel.contains(document.activeElement) && Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) === panel) panel.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    const onResize = () => {
      resizeAnimation.current?.cancel();
      previousSize.current = panelRef.current?.getBoundingClientRect() ?? null;
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      animations.current.forEach(animation => animation.cancel());
      animations.current.clear();
      previousSize.current = null;
    };
  }, []);

  const exit = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const fade = animate(overlay, [{ opacity: getComputedStyle(overlay).opacity }, { opacity: 0 }], "exit", "forwards");
    const slide = animate(panel, [{ transform: getComputedStyle(panel).transform }, { transform: "translateY(10px)" }], "exit", "forwards");
    // Keep the last frame until cleanup/unmount; never flash back to the open state.
    await Promise.all([fade.finished, slide.finished]).catch(() => { /* Unmount can finish the exit early. */ });
  };

  return { overlayRef, panelRef, contentRef, closing, exit };
}
