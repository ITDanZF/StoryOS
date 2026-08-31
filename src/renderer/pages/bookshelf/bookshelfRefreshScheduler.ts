export default class BookshelfRefreshScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly refresh: () => unknown,
    private readonly delayMs = 120,
  ) {}

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
