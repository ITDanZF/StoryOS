import { afterEach, describe, expect, it, vi } from "vitest";
import BookshelfRefreshScheduler from "../../src/renderer/features/bookshelf/bookshelfRefreshScheduler.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("bookshelf refresh scheduler", () => {
  it("coalesces a burst of book changes into one refresh", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = new BookshelfRefreshScheduler(refresh, 120);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(80);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(119);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending refresh when the bookshelf unmounts", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = new BookshelfRefreshScheduler(refresh, 120);

    scheduler.schedule();
    scheduler.dispose();
    await vi.runAllTimersAsync();

    expect(refresh).not.toHaveBeenCalled();
  });
});
