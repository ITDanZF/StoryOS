import "./motion.css";

type MotionDuration = "enter" | "exit" | "resize" | "content" | "fade";

/** CSS tokens are the single source of timing for both CSS and Web Animations. */
export function animateMotion(element: HTMLElement, frames: Keyframe[], duration: MotionDuration, fill: FillMode = "none") {
  const preferences = window.matchMedia("(prefers-reduced-motion: reduce)");
  const style = getComputedStyle(element);
  const animation = element.animate(frames, {
    duration: preferences.matches ? 0 : Number.parseFloat(style.getPropertyValue(`--motion-${duration}`)),
    easing: style.getPropertyValue("--motion-ease").trim(),
    fill,
  });
  const onPreferenceChange = () => { if (preferences.matches && animation.playState === "running") animation.finish(); };
  preferences.addEventListener("change", onPreferenceChange);
  void animation.finished.catch(() => { /* Cancellation is normal on navigation or a newer transition. */ })
    .finally(() => preferences.removeEventListener("change", onPreferenceChange));
  return animation;
}
