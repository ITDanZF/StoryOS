import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import type { ApplicationEvent } from "../application/contracts.ts";

export type ApplicationEventRecorder = {
  record(event: ApplicationEvent): Promise<void>;
};

function sanitizeEvent(event: ApplicationEvent): Record<string, unknown> {
  if (event.type === "plan_created") {
    return {
      type: event.type,
      runId: event.runId,
      timestamp: event.timestamp,
      planId: event.plan.planId,
      mode: event.plan.mode,
      taskCount: event.plan.mode === "planned" ? event.plan.tasks.length : 0,
    };
  }
  if (event.type === "skill_selected") {
    return {
      type: event.type,
      runId: event.runId,
      timestamp: event.timestamp,
      skills: event.skills.map((skill) => ({ id: skill.id, name: skill.name, score: skill.score })),
    };
  }
  const safeEvent = { ...event } as Record<string, unknown>;
  delete safeEvent.content;
  delete safeEvent.preview;
  return safeEvent;
}

export default class RunLogStore implements ApplicationEventRecorder {
  constructor(private readonly runsRoot: string) {}

  async record(event: ApplicationEvent): Promise<void> {
    if (event.type === "text_delta") return;
    const runId = "runId" in event && typeof event.runId === "string" ? event.runId : "workspace";
    await mkdir(this.runsRoot, { recursive: true });
    await appendFile(
      path.join(this.runsRoot, `${encodeURIComponent(runId)}.jsonl`),
      `${JSON.stringify(sanitizeEvent(event))}\n`,
      "utf-8",
    );
  }
}