import { currentRequestOwner } from "../../../bootstrap/RequestContext.ts";

type Session<T> = {
  state: "preparing" | "prepared" | "committing";
  owner: number | undefined;
  createdAt: number;
  value?: T;
  abandoned: boolean;
  dispose: () => void;
};

export default class TransferSessionManager<T> {
  private readonly sessions = new Map<string, Session<T>>();
  private readonly waiters = new Set<() => void>();
  private closed = false;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly options: {
      limit?: number;
      ttlMs?: number;
      now?: () => number;
      owner?: () => number | undefined;
    } = {},
  ) {
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }
  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
  private owner(): number | undefined {
    return (this.options.owner ?? currentRequestOwner)();
  }
  get size(): number {
    this.sweep();
    return this.sessions.size;
  }
  get busy(): boolean {
    return [...this.sessions.values()].some((s) => s.state !== "prepared");
  }

  reserve(id: string, dispose: () => void = () => undefined): void {
    this.sweep();
    if (this.closed) throw new Error("Transfer service is closing.");
    if (this.sessions.size >= (this.options.limit ?? 8))
      throw new Error("Too many pending transfer previews.");
    if (this.sessions.has(id)) throw new Error("Transfer session already exists.");
    this.sessions.set(id, {
      state: "preparing",
      owner: this.owner(),
      createdAt: this.now(),
      abandoned: false,
      dispose,
    });
  }
  set(id: string, value: T): void {
    if (!this.sessions.has(id)) this.reserve(id);
    const entry = this.require(id);
    if (entry.state !== "preparing") throw new Error("Transfer session is already prepared.");
    if (entry.abandoned || this.closed) {
      this.finish(id);
      throw new Error("Transfer owner closed.");
    }
    entry.value = value;
    entry.state = "prepared";
    entry.createdAt = this.now();
  }
  inspect(id: string): T {
    this.sweep();
    if (this.closed) throw new Error("Transfer service is closing.");
    const entry = this.require(id);
    if (entry.state !== "prepared" || entry.value === undefined)
      throw new Error("Transfer session is busy.");
    return entry.value;
  }
  claim(id: string): T {
    const value = this.inspect(id);
    this.require(id).state = "committing";
    return value;
  }
  cancel(id: string): void {
    if (!this.sessions.has(id)) return;
    const entry = this.require(id);
    if (entry.state !== "prepared") throw new Error("Transfer session is busy.");
    this.finish(id);
  }
  finish(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    this.sessions.delete(id);
    try {
      entry.dispose();
    } catch (error) {
      console.error("Transfer temporary resource cleanup failed", id, error);
    }
    if (!this.busy) {
      for (const resolve of this.waiters) resolve();
      this.waiters.clear();
    }
  }
  closeOwner(owner: number): void {
    for (const [id, entry] of this.sessions) {
      if (entry.owner !== owner) continue;
      if (entry.state === "prepared") this.finish(id);
      else entry.abandoned = true;
    }
  }
  close(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    for (const [id, entry] of this.sessions) {
      if (entry.state === "prepared") this.finish(id);
      else entry.abandoned = true;
    }
    return this.busy ? new Promise((resolve) => this.waiters.add(resolve)) : Promise.resolve();
  }
  private require(id: string): Session<T> {
    const entry = this.sessions.get(id);
    if (!entry) throw new Error("Transfer session has expired or was cancelled.");
    if (entry.owner !== this.owner())
      throw new Error("Transfer session belongs to another window.");
    return entry;
  }
  private sweep(): void {
    for (const [id, entry] of this.sessions) {
      if (
        entry.state === "prepared" &&
        this.now() - entry.createdAt >= (this.options.ttlMs ?? 30 * 60_000)
      )
        this.finish(id);
    }
  }
}
