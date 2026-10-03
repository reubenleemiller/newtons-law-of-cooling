import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runWithMinDelay } from "./runWithMinDelay";

describe("runWithMinDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the promise value after at least minMs", async () => {
    const promise = Promise.resolve(42);
    let settled = false;
    runWithMinDelay(promise, 2000).then(() => {
      settled = true;
    });

    // Advance to just before the minimum duration.
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);

    // Advance past the minimum duration.
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("returns the resolved value unchanged", async () => {
    const result = await Promise.all([
      runWithMinDelay(Promise.resolve("hello"), 100),
      vi.advanceTimersByTimeAsync(100),
    ]);
    expect(result[0]).toBe("hello");
  });

  it("waits for the promise if it takes longer than minMs", async () => {
    let resolveInner!: (v: number) => void;
    const slowPromise = new Promise<number>((resolve) => {
      resolveInner = resolve;
    });

    let result: number | undefined;
    runWithMinDelay(slowPromise, 500).then((v) => {
      result = v;
    });

    // min delay passes but promise is still pending
    await vi.advanceTimersByTimeAsync(500);
    expect(result).toBeUndefined();

    // now resolve the inner promise and flush microtasks
    resolveInner(7);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(result).toBe(7);
  });

  it("rejects if the inner promise rejects (after minMs)", async () => {
    const failing = Promise.reject(new Error("boom"));
    let caughtError: Error | null = null;
    runWithMinDelay(failing, 1000).catch((e: Error) => {
      caughtError = e;
    });

    // Rejection is held until the timer fires.
    await vi.advanceTimersByTimeAsync(999);
    await Promise.resolve();
    expect(caughtError).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toBe("boom");
  });

  it("uses 2000ms as the default minimum delay", async () => {
    const promise = Promise.resolve(true);
    let settled = false;
    runWithMinDelay(promise).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });
});
