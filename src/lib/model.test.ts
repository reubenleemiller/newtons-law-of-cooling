import { describe, it, expect } from "vitest";
import {
  computeKConstant,
  rk4Step,
  integrateRK4,
  findKByFitting,
  computeAnalyticTargetTime,
  findFirstCrossing,
  parseAmbientExpression,
  latexToExpression,
} from "./model";

describe("computeKConstant", () => {
  it("computes k correctly for known values", () => {
    // T(t) = Ta + (T0 - Ta)*exp(-k*t)
    // With T0=100, Ta=20, k=0.1, at t=10: T1 = 20 + 80*exp(-1) ≈ 49.43
    const T0 = 100;
    const Ta = 20;
    const k_expected = 0.1;
    const t1 = 10;
    const T1 = Ta + (T0 - Ta) * Math.exp(-k_expected * t1);
    const { k } = computeKConstant(T0, t1, T1, Ta);
    expect(k).toBeCloseTo(k_expected, 6);
  });

  it("computes k correctly for another known set", () => {
    // T0=200, Ta=25, k=0.05, t1=20
    const T0 = 200;
    const Ta = 25;
    const k_expected = 0.05;
    const t1 = 20;
    const T1 = Ta + (T0 - Ta) * Math.exp(-k_expected * t1);
    const { k } = computeKConstant(T0, t1, T1, Ta);
    expect(k).toBeCloseTo(k_expected, 6);
  });

  it("throws when T0 equals Ta", () => {
    expect(() => computeKConstant(20, 10, 15, 20)).toThrow();
  });

  it("throws when t1 <= 0", () => {
    expect(() => computeKConstant(100, 0, 50, 20)).toThrow();
    expect(() => computeKConstant(100, -5, 50, 20)).toThrow();
  });

  it("throws when ratio is non-positive", () => {
    // T1 on opposite side of Ta from T0 implies ratio < 0
    expect(() => computeKConstant(100, 10, 10, 20)).toThrow();
  });
});

describe("rk4Step", () => {
  it("matches exact solution for constant Ta", () => {
    // Exact: T(t+dt) = Ta + (T(t) - Ta)*exp(-k*dt)
    const Ta = 20;
    const k = 0.1;
    const T = 80;
    const t = 0;
    const dt = 0.5;
    const exact = Ta + (T - Ta) * Math.exp(-k * dt);
    const result = rk4Step(T, t, dt, k, () => Ta);
    expect(result).toBeCloseTo(exact, 5);
  });

  it("gives correct direction of change", () => {
    // Object hotter than ambient should cool
    const result = rk4Step(100, 0, 1, 0.1, () => 20);
    expect(result).toBeLessThan(100);
    // Object cooler than ambient should warm
    const result2 = rk4Step(10, 0, 1, 0.1, () => 20);
    expect(result2).toBeGreaterThan(10);
  });
});

describe("integrateRK4", () => {
  it("starts at T0", () => {
    const pts = integrateRK4(100, 10, 0.1, 0.1, () => 20);
    expect(pts[0].t).toBe(0);
    expect(pts[0].T).toBe(100);
  });

  it("ends near tMax", () => {
    const pts = integrateRK4(100, 10, 0.1, 0.1, () => 20);
    expect(pts[pts.length - 1].t).toBeCloseTo(10, 5);
  });

  it("matches analytical solution for constant Ta", () => {
    const T0 = 100;
    const Ta = 20;
    const k = 0.1;
    const tMax = 20;
    const dt = 0.01;
    const pts = integrateRK4(T0, tMax, dt, k, () => Ta);
    const last = pts[pts.length - 1];
    const exact = Ta + (T0 - Ta) * Math.exp(-k * last.t);
    expect(last.T).toBeCloseTo(exact, 3);
  });

  it("returns monotonically cooling sequence for constant Ta", () => {
    const pts = integrateRK4(100, 10, 0.5, 0.1, () => 20);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].T).toBeLessThan(pts[i - 1].T);
    }
  });
});

describe("findKByFitting", () => {
  it("finds k matching constant Ta (should agree with computeKConstant)", () => {
    const T0 = 100;
    const Ta = 20;
    const k_expected = 0.1;
    const t1 = 10;
    const T1 = Ta + (T0 - Ta) * Math.exp(-k_expected * t1);
    const { k } = findKByFitting(T0, t1, T1, () => Ta);
    expect(k).toBeCloseTo(k_expected, 3);
  });

  it("finds k for sinusoidal Ta", () => {
    // Generate T1 by integrating with a known k and sinusoidal Ta
    const T0 = 80;
    const k_true = 0.05;
    const t1 = 20;
    const taFn = (t: number) => 20 + 5 * Math.sin(0.1 * t);
    const pts = integrateRK4(T0, t1, 0.01, k_true, taFn);
    const T1 = pts[pts.length - 1].T;
    const { k } = findKByFitting(T0, t1, T1, taFn);
    expect(k).toBeCloseTo(k_true, 2);
  });

  it("throws for invalid t1", () => {
    expect(() => findKByFitting(100, 0, 50, () => 20)).toThrow();
  });
});

describe("computeAnalyticTargetTime", () => {
  it("returns correct hit time for constant ambient cooling", () => {
    // T(t) = Ta + (T0-Ta)*exp(-k*t) => t = -(1/k)*ln((Tt-Ta)/(T0-Ta))
    const T0 = 100;
    const Ta = 20;
    const k = 0.1;
    const T_target = 60;
    const expected = -(1 / k) * Math.log((T_target - Ta) / (T0 - Ta));
    const result = computeAnalyticTargetTime(T_target, T0, Ta, k);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(expected, 6);
  });

  it("returns null when T_target equals Ta (already at ambient)", () => {
    // ratio = 0 => log is -Infinity => not reachable in finite time
    const result = computeAnalyticTargetTime(20, 100, 20, 0.1);
    expect(result).toBeNull();
  });

  it("returns null when T_target is beyond T0 (unreachable)", () => {
    // Object cooling from 100 to 20; target of 110 is never reached
    const result = computeAnalyticTargetTime(110, 100, 20, 0.1);
    expect(result).toBeNull();
  });

  it("returns null when T0 equals Ta", () => {
    const result = computeAnalyticTargetTime(50, 20, 20, 0.1);
    expect(result).toBeNull();
  });

  it("returns t=0 when T_target equals T0", () => {
    const result = computeAnalyticTargetTime(100, 100, 20, 0.1);
    // ratio = 1, ln(1) = 0, t_hit = 0
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0, 6);
  });
});

describe("findFirstCrossing", () => {
  it("finds crossing for constant ambient case", () => {
    const T0 = 100;
    const Ta = 20;
    const k = 0.1;
    const T_target = 60;
    const taFn = () => Ta;
    const tMax = 50;
    const dt = 0.1;
    const pts = integrateRK4(T0, tMax, dt, k, taFn);
    const t_hit = findFirstCrossing(pts, T_target, k, taFn);
    const expected = -(1 / k) * Math.log((T_target - Ta) / (T0 - Ta));
    expect(t_hit).not.toBeNull();
    expect(t_hit!).toBeCloseTo(expected, 1);
  });

  it("returns null when target is not crossed", () => {
    const T0 = 100;
    const Ta = 20;
    const k = 0.1;
    const T_target = 5; // below Ta, never reached when cooling
    const taFn = () => Ta;
    const pts = integrateRK4(T0, 50, 0.1, k, taFn);
    const result = findFirstCrossing(pts, T_target, k, taFn);
    expect(result).toBeNull();
  });

  it("returns null for empty or single-point array", () => {
    expect(findFirstCrossing([], 50, 0.1, () => 20)).toBeNull();
    expect(findFirstCrossing([{ t: 0, T: 100 }], 50, 0.1, () => 20)).toBeNull();
  });
});

describe("parseAmbientExpression", () => {
  it("parses and evaluates a simple constant", () => {
    const fn = parseAmbientExpression("20");
    expect(fn(0)).toBeCloseTo(20);
    expect(fn(5)).toBeCloseTo(20);
  });

  it("parses expression with t variable", () => {
    const fn = parseAmbientExpression("20 + 0.5 * t");
    expect(fn(0)).toBeCloseTo(20);
    expect(fn(10)).toBeCloseTo(25);
  });

  it("parses sinusoidal expression", () => {
    const fn = parseAmbientExpression("20 + 5 * sin(0.1 * t)");
    expect(fn(0)).toBeCloseTo(20);
    expect(fn(Math.PI / 0.1)).toBeCloseTo(20, 4);
  });

  it("throws for disallowed symbols", () => {
    expect(() => parseAmbientExpression("20 + x")).toThrow(/Disallowed symbol/);
  });

  it("throws for empty expression", () => {
    expect(() => parseAmbientExpression("")).toThrow();
  });

  it("throws for invalid syntax", () => {
    expect(() => parseAmbientExpression("sin(t + ")).toThrow();
  });
});

describe("latexToExpression", () => {
  it("converts \\sin to sin", () => {
    expect(latexToExpression("20 + 5\\sin(0.1 t)")).toBe("20 + 5*sin(0.1*t)");
  });

  it("converts \\pi to pi", () => {
    expect(latexToExpression("\\pi")).toBe("pi");
  });

  it("converts \\ln to log", () => {
    expect(latexToExpression("\\ln(t)")).toBe("log(t)");
  });

  it("converts implicit multiplication digit-t", () => {
    expect(latexToExpression("2t")).toBe("2*t");
  });

  it("converts LaTeX braces to parens for sqrt", () => {
    expect(latexToExpression("\\sqrt{t}")).toBe("sqrt(t)");
  });
});
