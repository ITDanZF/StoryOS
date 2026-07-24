import path from "node:path";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import type {
  ApplicationEvent,
  RunSnapshot,
  RunStatus,
  SerializableError,
} from "../application/contracts.ts";

const DEFAULT_MAX_SEGMENT_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_RUN_LOGS = 500;

export type ApplicationEventRecorder = {
  record(event: ApplicationEvent): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
};

export type RunLogStoreOptions = {
  readonly maxSegmentBytes?: number;
  readonly maxRunLogs?: number;
};

type SegmentState = {
  part: number;
  size: number;
};

type LogFile = {
  readonly fileName: string;
  readonly filePath: string;
  readonly runId: string;
  readonly part: number;
  readonly modifiedAt: number;
};

type RecordedEvent = Record<string, unknown> & {
  readonly type?: unknown;
  readonly runId?: unknown;
  readonly timestamp?: unknown;
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
      skills: event.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        score: skill.score,
      })),
    };
  }
  const safeEvent = { ...event } as Record<string, unknown>;
  delete safeEvent.content;
  delete safeEvent.preview;
  return safeEvent;
}

function isTerminalEvent(type: string): boolean {
  return [
    "run_completed",
    "run_aborted",
    "run_timed_out",
    "run_failed",
  ].includes(type);
}

function parseLogFileName(fileName: string): {
  readonly runId: string;
  readonly part: number;
} | null {
  const segmented = /^(.*)\.part-(\d{6})\.jsonl$/.exec(fileName);
  if (segmented) {
    try {
      return {
        runId: decodeURIComponent(segmented[1]),
        part: Number(segmented[2]),
      };
    } catch {
      return null;
    }
  }
  if (!fileName.endsWith(".jsonl")) return null;
  try {
    return {
      runId: decodeURIComponent(fileName.slice(0, -".jsonl".length)),
      part: 0,
    };
  } catch {
    return null;
  }
}

function readError(value: unknown): SerializableError {
  if (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "message" in value &&
    typeof value.name === "string" &&
    typeof value.message === "string"
  ) {
    return Object.freeze({ name: value.name, message: value.message });
  }
  return Object.freeze({
    name: "Error",
    message: typeof value === "string" ? value : "Unknown run failure.",
  });
}

function reconstructRun(
  runId: string,
  events: readonly RecordedEvent[],
): RunSnapshot | null {
  const started = events.find((event) =>
    event.type === "run_started" &&
    event.runId === runId &&
    typeof event.threadId === "string" &&
    typeof event.timestamp === "string"
  );
  if (!started || typeof started.threadId !== "string" ||
    typeof started.timestamp !== "string") {
    return null;
  }

  let status: RunStatus = "aborted";
  let completedAt: string | undefined;
  let durationMs: number | undefined;
  let error: SerializableError | undefined = Object.freeze({
    name: "RunInterruptedError",
    message: "Application exited before the run completed.",
  });
  for (const event of events) {
    if (event.runId !== runId || typeof event.type !== "string") continue;
    if (event.type === "run_completed") {
      status = "completed";
      error = undefined;
    } else if (event.type === "run_aborted") {
      status = "aborted";
      error = readError(event.error);
    } else if (event.type === "run_timed_out") {
      status = "timed_out";
      error = readError(event.error);
    } else if (event.type === "run_failed") {
      status = "failed";
      error = readError(event.error);
    } else {
      continue;
    }
    if (typeof event.timestamp === "string") completedAt = event.timestamp;
    if (typeof event.durationMs === "number") durationMs = event.durationMs;
  }

  if (!completedAt && events.length > 0) {
    const lastTimestamp = [...events].reverse().find(
      (event) => typeof event.timestamp === "string",
    )?.timestamp;
    if (typeof lastTimestamp === "string") completedAt = lastTimestamp;
    const startedMs = Date.parse(started.timestamp);
    const completedMs = completedAt ? Date.parse(completedAt) : Number.NaN;
    if (Number.isFinite(startedMs) && Number.isFinite(completedMs)) {
      durationMs = Math.max(0, completedMs - startedMs);
    }
  }

  return Object.freeze({
    runId,
    threadId: started.threadId,
    status,
    startedAt: started.timestamp,
    ...(completedAt ? { completedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(error ? { error } : {}),
  });
}

export default class RunLogStore implements ApplicationEventRecorder {
  private readonly maxSegmentBytes: number;
  private readonly maxRunLogs: number;
  private readonly segmentStates = new Map<string, SegmentState>();
  private readonly activeRunIds = new Set<string>();
  private writeQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly runsRoot: string,
    options: RunLogStoreOptions = {},
  ) {
    this.maxSegmentBytes =
      options.maxSegmentBytes ?? DEFAULT_MAX_SEGMENT_BYTES;
    this.maxRunLogs = options.maxRunLogs ?? DEFAULT_MAX_RUN_LOGS;
    if (!Number.isInteger(this.maxSegmentBytes) ||
      this.maxSegmentBytes <= 0) {
      throw new Error("maxSegmentBytes must be a positive integer.");
    }
    if (!Number.isInteger(this.maxRunLogs) || this.maxRunLogs <= 0) {
      throw new Error("maxRunLogs must be a positive integer.");
    }
  }

  record(event: ApplicationEvent): Promise<void> {
    if (event.type === "text_delta") return Promise.resolve();
    if (this.closed) {
      return Promise.reject(new Error("Run log store is closed."));
    }
    const task = this.writeQueue.then(() => this.writeEvent(event));
    this.writeQueue = task.catch((): void => undefined);
    return task;
  }

  async loadRunSnapshots(limit = this.maxRunLogs): Promise<readonly RunSnapshot[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("Run history limit must be a non-negative integer.");
    }
    await this.flush();
    const files = await this.listLogFiles();
    const groups = new Map<string, LogFile[]>();
    for (const file of files) {
      const group = groups.get(file.runId) ?? [];
      group.push(file);
      groups.set(file.runId, group);
    }

    const snapshots: RunSnapshot[] = [];
    for (const [runId, runFiles] of groups) {
      const events: RecordedEvent[] = [];
      for (const file of runFiles.sort((left, right) =>
        left.part - right.part)) {
        let content: string;
        try {
          content = await readFile(file.filePath, "utf-8");
        } catch {
          continue;
        }
        for (const line of content.split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as unknown;
            if (typeof parsed === "object" && parsed !== null) {
              events.push(parsed as RecordedEvent);
            }
          } catch {
            // A damaged line is isolated from the remaining run history.
          }
        }
      }
      const snapshot = reconstructRun(runId, events);
      if (snapshot) snapshots.push(snapshot);
    }

    snapshots.sort((left, right) =>
      Date.parse(right.startedAt) - Date.parse(left.startedAt));
    return Object.freeze(snapshots.slice(0, limit));
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  async close(): Promise<void> {
    if (this.closed) {
      await this.flush();
      return;
    }
    this.closed = true;
    await this.flush();
    this.activeRunIds.clear();
    this.segmentStates.clear();
  }

  private async writeEvent(event: ApplicationEvent): Promise<void> {
    const runId = "runId" in event && typeof event.runId === "string"
      ? event.runId
      : "workspace";
    const line = `${JSON.stringify(sanitizeEvent(event))}\n`;
    const lineBytes = Buffer.byteLength(line, "utf-8");
    await mkdir(this.runsRoot, { recursive: true });
    const state = await this.getSegmentState(runId);
    if (state.size > 0 && state.size + lineBytes > this.maxSegmentBytes) {
      state.part += 1;
      state.size = 0;
    }
    await appendFile(this.segmentPath(runId, state.part), line, "utf-8");
    state.size += lineBytes;

    if (event.type === "run_started") {
      this.activeRunIds.add(runId);
    } else if (isTerminalEvent(event.type)) {
      this.activeRunIds.delete(runId);
      await this.pruneRunLogs();
    }
  }

  private async getSegmentState(runId: string): Promise<SegmentState> {
    const existing = this.segmentStates.get(runId);
    if (existing) return existing;
    const files = (await this.listLogFiles())
      .filter((file) => file.runId === runId && file.part > 0)
      .sort((left, right) => right.part - left.part);
    const latest = files[0];
    const state = {
      part: latest?.part ?? 1,
      size: latest ? (await stat(latest.filePath)).size : 0,
    };
    this.segmentStates.set(runId, state);
    return state;
  }

  private async pruneRunLogs(): Promise<void> {
    const files = await this.listLogFiles();
    const groups = new Map<string, {
      readonly files: LogFile[];
      modifiedAt: number;
    }>();
    for (const file of files) {
      const existing = groups.get(file.runId);
      if (existing) {
        existing.files.push(file);
        existing.modifiedAt = Math.max(existing.modifiedAt, file.modifiedAt);
      } else {
        groups.set(file.runId, {
          files: [file],
          modifiedAt: file.modifiedAt,
        });
      }
    }
    const expired = [...groups.entries()]
      .filter(([runId]) => !this.activeRunIds.has(runId))
      .sort((left, right) => right[1].modifiedAt - left[1].modifiedAt)
      .slice(this.maxRunLogs);
    for (const [runId, group] of expired) {
      await Promise.all(group.files.map((file) =>
        rm(file.filePath, { force: true })));
      this.segmentStates.delete(runId);
    }
  }

  private async listLogFiles(): Promise<LogFile[]> {
    await mkdir(this.runsRoot, { recursive: true });
    const entries = await readdir(this.runsRoot, { withFileTypes: true });
    const files: LogFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const parsed = parseLogFileName(entry.name);
      if (!parsed) continue;
      const filePath = path.join(this.runsRoot, entry.name);
      try {
        const metadata = await stat(filePath);
        files.push({
          fileName: entry.name,
          filePath,
          runId: parsed.runId,
          part: parsed.part,
          modifiedAt: metadata.mtimeMs,
        });
      } catch {
        // Files removed concurrently by retention are ignored.
      }
    }
    return files;
  }

  private segmentPath(runId: string, part: number): string {
    return path.join(
      this.runsRoot,
      `${encodeURIComponent(runId)}.part-${String(part).padStart(6, "0")}.jsonl`,
    );
  }
}
