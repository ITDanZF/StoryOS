import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../lib/utils.ts";
import useDialogMotion from "./useDialogMotion.ts";
import useDialogFocus from "./useDialogFocus.ts";

type Props = {
  "aria-labelledby": string;
  "aria-describedby"?: string;
  className?: string;
  overlayClassName?: string;
  stage?: string | number;
  busy?: boolean;
  onClose: () => void;
  /** Best-effort resource cleanup, run concurrently with the exit animation. */
  beforeClose?: () => void | Promise<unknown>;
  children: (controls: { close: () => void; closing: boolean }) => ReactNode;
};

/** onClose fires after exit; render-prop close handles buttons, backdrop, Escape and busy guards. */
export default function AnimatedDialog({ children, stage = "default", busy = false, onClose, beforeClose, className, overlayClassName, ...labels }: Props) {
  const motion = useDialogMotion(stage);
  const closeRequested = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const close = () => {
    if (busy || closeRequested.current) return;
    closeRequested.current = true;
    void Promise.allSettled([motion.exit(), Promise.resolve().then(() => beforeClose?.())])
      .then(() => { if (mounted.current) onClose(); });
  };
  useDialogFocus(motion.panelRef, close);

  return createPortal(<div ref={motion.overlayRef} className={cn("motion-dialog-overlay fixed inset-0 z-[110] grid place-items-center bg-black/30 p-3 backdrop-blur-[3px]", overlayClassName)} role="presentation"
    onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section {...labels} ref={motion.panelRef} className={cn("motion-dialog flex max-h-[calc(100dvh-24px)] min-h-0 w-full flex-col overflow-hidden", className)} role="dialog" aria-modal="true"
      tabIndex={-1} data-stage={stage} data-closing={motion.closing} inert={motion.closing}>
      <div ref={motion.contentRef} className="motion-dialog-content">{children({ close, closing: motion.closing })}</div>
    </section>
  </div>, document.body);
}
