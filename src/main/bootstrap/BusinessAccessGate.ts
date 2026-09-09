export default class BusinessAccessGate {
  private accepting = true;
  private active = 0;
  private readonly drained = new Set<() => void>();
  get busy(): boolean {
    return this.active > 0;
  }
  stop(): void {
    this.accepting = false;
  }
  resume(): void {
    this.accepting = true;
  }
  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (!this.accepting) throw new Error("数据库编辑会话或服务关闭期间，业务访问已暂停。");
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
      if (!this.active) {
        for (const resolve of this.drained) resolve();
        this.drained.clear();
      }
    }
  }
  waitForIdle(): Promise<void> {
    return this.active ? new Promise((resolve) => this.drained.add(resolve)) : Promise.resolve();
  }
}
