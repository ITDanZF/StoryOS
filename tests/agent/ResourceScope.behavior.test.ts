import { describe, expect, it, vi } from "vitest";
import ResourceScope from "../../src/main/bootstrap/ResourceScope.ts";
import BusinessAccessGate from "../../src/main/bootstrap/BusinessAccessGate.ts";

describe("resource ownership", () => {
  it("continues reverse cleanup after failure and closes only once", async () => {
    const scope = new ResourceScope();
    const calls: number[] = [];
    scope.add("database", () => {
      calls.push(1);
    });
    scope.add("runtime", () => {
      calls.push(2);
      throw Error("failed");
    });
    scope.add("reader", () => {
      calls.push(3);
    });
    const closing = scope.close();
    expect(scope.close()).toBe(closing);
    expect(() => scope.add("late", vi.fn())).toThrow("closing");
    await expect(closing).rejects.toThrow("cleanup");
    expect(calls).toEqual([3, 2, 1]);
  });
  it("stops new requests while draining existing operations", async () => {
    const gate = new BusinessAccessGate();
    let finish!: () => void;
    const pending = gate.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    gate.stop();
    await expect(gate.run(() => 1)).rejects.toThrow("暂停");
    expect(gate.busy).toBe(true);
    finish();
    await Promise.all([pending, gate.waitForIdle()]);
    expect(gate.busy).toBe(false);
  });
});
