import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "../../../lib/utils.ts";
import { animateMotion } from "./motion.ts";

type Props = HTMLAttributes<HTMLDivElement> & {
  transitionKey?: string | number;
  disabled?: boolean;
};

/** Fade the route without remounting its editor or transforming fixed-position children. */
export default function AnimatedPage({ transitionKey, disabled = false, className, children, ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (disabled || !ref.current) return;
    const animation = animateMotion(ref.current, [{ opacity: 0 }, { opacity: 1 }], "content");
    return () => animation.cancel();
  }, [transitionKey, disabled]);
  return <div {...props} ref={ref} className={cn("motion-page flex min-h-0 min-w-0 flex-1 flex-col", className)}>{children}</div>;
}
