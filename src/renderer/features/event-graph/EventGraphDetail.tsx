import { useEffect, useRef, type ReactNode } from "react";
import { animateMotion } from "../../components/motion/motion.ts";
import type { EventBrief } from "./model/eventBrief.ts";

type EventGraphDetailProps = {
  readonly open: boolean;
  readonly brief: EventBrief;
  readonly left: number;
  readonly top: number;
  readonly onClose: () => void;
  readonly onExited: () => void;
};

export default function EventGraphDetail({ open, brief, left, top, onClose, onExited }: EventGraphDetailProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const animation = animateMotion(panel, open
      ? [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }]
      : [{}, { opacity: 0, transform: "translateY(6px)" }], open ? "enter" : "exit", "both");
    let cancelled = false;
    if (!open) {
      void animation.finished.then(() => {
        if (!cancelled) onExited();
      }).catch(() => { /* A newer open cancels the exit. */ });
    }
    return () => {
      cancelled = true;
      try { animation.commitStyles(); } catch { /* The animation is already idle. */ }
      animation.cancel();
    };
  }, [open, onExited]);

  return (
    <div
      className="absolute z-30 transition-[left,top] duration-[var(--motion-resize)] ease-[var(--motion-ease)] motion-reduce:transition-none"
      style={{ left, top }}
    >
      <div
        ref={panelRef}
        data-detail-popover=""
        className="max-h-[min(420px,70vh)] w-72 overflow-auto rounded-xl border border-border bg-card p-3 text-left"
        role="dialog"
        aria-label={`${brief.title}的详情`}
      >
        <div key={brief.id} className="motion-fade">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-[11px] font-semibold text-text-subtle">
              {brief.proposal ? "草稿" : "事件"}
              {brief.chapterLabel ? ` · ${brief.chapterLabel}` : ""}
              {` · ${brief.statusLabel}`}
            </p>
            <button type="button" className="border-0 bg-transparent p-0 text-xs text-accent-foreground" onClick={onClose}>关闭</button>
          </div>
          <h2 className="m-0 mt-1 text-base font-semibold">{brief.title}</h2>
          <p className="m-0 mt-1 text-[12px] text-text-secondary">
            讲述 {brief.reading} · 故事 {brief.storyNumber}
            {brief.jump ? ` · ${brief.jump}` : ""}
          </p>
          <Section title="变化">
            <Line label="之前" value={brief.change.before} />
            <Line label="之后" value={brief.change.after} />
          </Section>
          <Section title="参与">
            {brief.participants.length === 0 ? <p className="m-0 text-[12px] text-text-secondary">还没有参与者。</p> : brief.participants.map((person) => (
              <p key={person.name} className="m-0 text-[12px] leading-5">
                <span>{person.name}</span>
                <span className="ml-2 text-text-subtle">{[person.kind, person.role].filter((part) => part !== "").join(" · ")}</span>
                <span className="mt-0.5 block text-text-secondary">{person.before || "未写"} → {person.after || "未写"}</span>
              </p>
            ))}
          </Section>
          <Section title="必须守住的关系">
            {brief.constraints.length === 0 ? <p className="m-0 text-[12px] text-text-secondary">没有必须守住的情节关系。</p> : brief.constraints.map((constraint) => (
              <p key={constraint.id} className="m-0 text-[12px] leading-5">
                <span className="text-text-subtle">{constraint.direction === "out" ? "通向" : "来自"} {constraint.otherTitle}</span>
                <span className="mx-1 text-text-subtle">{constraint.typeLabel}</span>
                {constraint.description && <span className="text-text-secondary">{constraint.description}</span>}
              </p>
            ))}
          </Section>
          <Section title="下一拍只作过渡">
            {brief.next ? (
              <p className="m-0 text-[12px] leading-5 text-text-secondary">
                {`写到这一拍为止。下一拍是「${brief.next.title}」${brief.next.changeAfter ? `：${brief.next.changeAfter}` : ""}。不要在这一章把它展开。`}
              </p>
            ) : (
              <p className="m-0 text-[12px] text-text-secondary">这是目前讲述顺序的最后一拍。</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="m-0 text-[11px] font-semibold text-text-subtle">{title}</h3>
      <div className="mt-1 grid gap-1">{children}</div>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="m-0 text-[12px] leading-5">
      <span className="text-text-subtle">{label}</span>
      <span className="ml-2">{value.trim() !== "" ? value : "未写"}</span>
    </p>
  );
}
