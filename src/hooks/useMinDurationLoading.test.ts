import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMinDurationLoading } from "./useMinDurationLoading";

describe("useMinDurationLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when isLoading is false from the start", () => {
    const { result } = renderHook(() => useMinDurationLoading(false));
    expect(result.current).toBe(false);
  });

  it("returns true immediately when isLoading becomes true", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useMinDurationLoading(loading),
      { initialProps: { loading: false } }
    );
    expect(result.current).toBe(false);

    act(() => {
      rerender({ loading: true });
    });
    expect(result.current).toBe(true);
  });

  it("stays true for the full minimum duration even if isLoading goes false quickly", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useMinDurationLoading(loading, 2000),
      { initialProps: { loading: true } }
    );
    expect(result.current).toBe(true);

    // Computation finishes before the minimum duration.
    act(() => {
      rerender({ loading: false });
    });
    // Should still be showing the spinner.
    expect(result.current).toBe(true);

    // Advance to just before the minimum duration.
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current).toBe(true);

    // Advance past the minimum duration.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it("turns off immediately when elapsed time already exceeds minimum duration", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useMinDurationLoading(loading, 2000),
      { initialProps: { loading: true } }
    );

    // Simulate the computation taking longer than the minimum.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    act(() => {
      rerender({ loading: false });
    });

    // The minimum has already elapsed, so the spinner should hide immediately.
    expect(result.current).toBe(false);
  });

  it("respects a custom minDurationMs", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useMinDurationLoading(loading, 500),
      { initialProps: { loading: true } }
    );

    act(() => {
      rerender({ loading: false });
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
