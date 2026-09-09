import { ArchiveRestore, FileOutput, MoreHorizontal, Trash2 } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string; bookId: string; linked: boolean; busy: boolean; open: boolean;
  onToggle: () => void; onClose: () => void;
  onExport: () => void; onArchives: () => void; onTrash: () => void;
};

export default function BookActionMenu(props: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialItem = useRef<number | null>(null);
  const [present, setPresent] = useState(props.open);
  const [position, setPosition] = useState({ left: 12, top: 12, transformOrigin: "top left" });
  const close = (restore = false) => { props.onClose(); if (restore) trigger.current?.focus({ preventScroll: true }); };

  useLayoutEffect(() => {
    if (props.open) setPresent(true);
  }, [props.open]);

  useLayoutEffect(() => {
    if (!props.open || !present || !menu.current) return;
    const element = menu.current;
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      // Layout dimensions stay constant while the visual surface animates.
      const width = element.offsetWidth, height = element.offsetHeight;
      const gap = 10, edge = 12;
      const rightFits = anchor.right + gap + width <= innerWidth - edge;
      const leftFits = anchor.left - gap - width >= edge;
      let left: number, top: number, origin: string;
      if (rightFits || leftFits) {
        left = rightFits ? anchor.right + gap : anchor.left - width - gap;
        top = Math.max(edge, Math.min(anchor.top, innerHeight - height - edge));
        origin = `${rightFits ? "left" : "right"} ${Math.round(anchor.top + anchor.height / 2 - top)}px`;
      } else {
        const below = anchor.bottom + gap + height <= innerHeight - edge;
        left = Math.max(edge, Math.min(anchor.right - width, innerWidth - width - edge));
        top = Math.max(edge, Math.min(below ? anchor.bottom + gap : anchor.top - height - gap, innerHeight - height - edge));
        origin = `${Math.round(anchor.left + anchor.width / 2 - left)}px ${below ? "top" : "bottom"}`;
      }
      setPosition({ left, top, transformOrigin: origin });
    };
    update();
    if (initialItem.current === null) element.focus({ preventScroll: true });
    else element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[initialItem.current]?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const path = event.composedPath();
      if (!path.includes(element) && !path.includes(trigger.current)) props.onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); props.onClose(); trigger.current?.focus({ preventScroll: true }); }
    };
    const observer = new ResizeObserver(update); observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("blur", props.onClose);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true);
      window.removeEventListener("blur", props.onClose);
      document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [props.open, props.onClose, present]);

  useLayoutEffect(() => {
    if (!present || !menu.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opening = props.open;
    const animation = menu.current.animate(opening ? [
      { opacity: 0, transform: "translateY(-4px) scale(.96)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ] : [
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(-2px) scale(.98)" },
    ], { duration: reduced ? 0 : opening ? 180 : 120, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
    let alive = true;
    void animation.finished.then(() => { if (alive && !opening) setPresent(false); }).catch(() => { /* Reopening or unmounting cancels the previous animation. */ });
    return () => { alive = false; animation.cancel(); };
  }, [props.open, present]);

  const run = (action: () => void, disabled = false) => { if (props.busy || disabled) return; close(true); action(); };
  return <>
    <button ref={trigger} id={`${id}-trigger`} className="shelf-more" type="button" data-book-menu={props.bookId}
      aria-label={`管理《${props.title}》`} aria-haspopup="menu" aria-expanded={props.open} aria-controls={props.open ? id : undefined}
      onClick={event => { initialItem.current = event.detail === 0 ? 0 : null; props.onToggle(); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); initialItem.current = event.key === "ArrowUp" ? 2 : 0;
          if (!props.open) props.onToggle();
          else menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[initialItem.current]?.focus();
        }
      }}><MoreHorizontal size={18} aria-hidden="true" /></button>
    {present && createPortal(<div ref={menu} id={id} className="shelf-action-menu" role="menu" tabIndex={-1} aria-hidden={!props.open} inert={!props.open} aria-labelledby={`${id}-trigger`}
      style={position} onKeyDown={event => {
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index < 0 ? (event.key === "ArrowUp" ? items.length - 1 : 0) : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        else if (event.key === "Tab") {
          // Continue in the card's DOM order rather than the portal's position at body end.
          trigger.current?.focus({ preventScroll: true }); props.onClose();
        }
      }}>
      <button role="menuitem" tabIndex={-1} aria-disabled={props.busy} onClick={() => run(props.onExport)}><FileOutput size={18} />导出书籍</button>
      <button role="menuitem" tabIndex={-1} aria-disabled={props.busy} onClick={() => run(props.onArchives)}><ArchiveRestore size={18} />查看项目归档</button>
      <div role="separator" className="shelf-menu-divider" />
      <button role="menuitem" tabIndex={-1} className="shelf-menu-trash" aria-disabled={props.busy || props.linked}
        aria-describedby={props.linked ? `${id}-reason` : undefined} onClick={() => run(props.onTrash, props.linked)}><Trash2 size={18} />移入回收站</button>
      {props.linked && <p id={`${id}-reason`} className="shelf-menu-reason">仍关联写作项目，暂不能移入回收站</p>}
    </div>, document.body)}
  </>;
}
