/**
 * Newton's Law of Cooling model utilities
 * dT/dt = -k * (T - Ta(t))
 */
import { create, all } from "mathjs";

export interface DataPoint {
  t: number;
  T: number;
}

// Safe mathjs instance restricted to known safe functions/constants
const math = create(all);
const ALLOWED_SYMBOLS = new Set([
  "t", "pi", "e",
  "sin", "cos", "tan", "asin", "acos", "atan",
  "exp", "log", "log2", "log10", "sqrt", "pow", "abs",
  "floor", "ceil", "round", "sign",
]);

/**
 * Parse an ambient temperature expression string into a function (t: number) => number.
 * Supports mathjs expression syntax: e.g. "20 + 5*sin(0.1*t)"
 * Throws a descriptive error if the expression uses disallowed symbols.
 */
export function parseAmbientExpression(expr: string): (t: number) => number {
  if (!expr.trim()) {
    throw new Error("Ambient expression must not be empty.");
  }
  // Check for disallowed symbols by parsing the node tree
  let compiled: { evaluate: (scope: Record<string, number>) => number };
  try {
    const node = math.parse(expr);
    // Walk AST to find any symbol nodes not in allowlist
    node.traverse((n) => {
      if (n.type === "SymbolNode") {
        const sym = (n as unknown as { name: string }).name;
        if (!ALLOWED_SYMBOLS.has(sym)) {
          throw new Error(
            `Disallowed symbol "${sym}". Allowed symbols: t, pi, e.`
          );
        }
      }
      if (n.type === "FunctionNode") {
        const fn = (n as unknown as { name: string }).name;
        if (!ALLOWED_SYMBOLS.has(fn)) {
          throw new Error(
            `Disallowed function "${fn}". Allowed functions: sin, cos, tan, asin, acos, atan, exp, log, log2, log10, sqrt, pow, abs, floor, ceil, round, sign.`
          );
        }
      }
    });
    compiled = math.compile(expr) as unknown as { evaluate: (scope: Record<string, number>) => number };
  } catch (err) {
    throw new Error(`Expression parse error: ${(err as Error).message}`);
  }
  return (t: number) => {
    const result = compiled.evaluate({ t });
    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error(`Expression evaluated to non-finite value at t=${t}.`);
    }
    return result;
  };
}

/**
 * Convert a LaTeX subset ambient expression to mathjs syntax.
 * Supported: \sin, \cos, \tan, \exp, \ln, \log, \sqrt, \pi, implicit multiplication "2t" -> "2*t"
 */
export function latexToExpression(latex: string): string {
  const expr = latex
    // Replace LaTeX commands with mathjs equivalents
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\exp/g, "exp")
    .replace(/\\ln/g, "log")
    .replace(/\\log/g, "log10")
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\\sqrt/g, "sqrt")
    .replace(/\\pi/g, "pi")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    // Remove remaining braces used as LaTeX grouping
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    // Add multiplication between number and function name: "5sin" -> "5*sin", "5log2" -> "5*log2"
    .replace(/(\d)(sin|cos|tan|asin|acos|atan|exp|log10|log2|log|sqrt|pow|abs)\b/g, "$1*$2")
    // Add multiplication between number and variable: "2t" -> "2*t", "2(..." -> "2*("
    .replace(/(\d)(t\b)/g, "$1*$2")
    .replace(/(\d)\(/g, "$1*(")
    // Add multiplication between number/variable and space-separated variable: "0.1 t" -> "0.1*t"
    .replace(/(\d)\s+(t\b)/g, "$1*$2")
    // Trim whitespace
    .trim();
  return expr;
}

/**
 * Compute the first time t_hit ≥ 0 when T(t) first reaches T_target for constant ambient.
 * Analytical formula: t = -(1/k) * ln((T_target - Ta) / (T0 - Ta))
 * Returns null if target is not reachable (outside the range between T0 and Ta).
 */
export function computeAnalyticTargetTime(
  T_target: number,
  T0: number,
  Ta: number,
  k: number
): number | null {
  if (T0 === Ta) return null;
  const ratio = (T_target - Ta) / (T0 - Ta);
  if (ratio <= 0 || ratio > 1) {
    // ratio > 1 means T_target is further from Ta than T0 (never reached)
    // ratio <= 0 means T_target is on other side of Ta
    return null;
  }
  const t_hit = -(1 / k) * Math.log(ratio);
  if (t_hit < 0) return null;
  return t_hit;
}

/**
 * Find the first crossing of T(t) = T_target in the given points array.
 * Returns the refined crossing time via bisection, or null if no crossing found.
 */
export function findFirstCrossing(
  points: DataPoint[],
  T_target: number,
  k: number,
  taFn: (t: number) => number
): number | null {
  if (points.length < 2) return null;

  const g = (p: DataPoint) => p.T - T_target;

  // Find first sign change
  let i0 = -1;
  for (let i = 0; i < points.length - 1; i++) {
    if (g(points[i]) * g(points[i + 1]) <= 0) {
      i0 = i;
      break;
    }
  }
  if (i0 === -1) return null;

  // Refine crossing via bisection on the ODE
  let tLow = points[i0].t;
  let tHigh = points[i0 + 1].t;
  let T_tLow = points[i0].T;

  const integrateFrom = (tFrom: number, TFrom: number, tTo: number): number => {
    const span = tTo - tFrom;
    if (span <= 0) return TFrom;
    const dt = span / 200;
    const pts = integrateRK4(TFrom, span, dt, k, (tv) => taFn(tv + tFrom));
    return pts[pts.length - 1].T;
  };

  const TOL = 1e-8;
  const MAX_ITER = 60;
  for (let i = 0; i < MAX_ITER; i++) {
    const tMid = (tLow + tHigh) / 2;
    if (tHigh - tLow < TOL) {
      return tMid;
    }
    const Tmid = integrateFrom(tLow, T_tLow, tMid);
    const gLow = T_tLow - T_target;
    const gMid = Tmid - T_target;
    if (gLow * gMid <= 0) {
      tHigh = tMid;
    } else {
      tLow = tMid;
      T_tLow = Tmid; // Keep T_tLow in sync when the lower bound advances
    }
  }
  return (tLow + tHigh) / 2;
}

/**
 * Compute k analytically for constant ambient temperature.
 * k = -(1/t1) * ln((T1 - Ta) / (T0 - Ta))
 */
export function computeKConstant(
  T0: number,
  t1: number,
  T1: number,
  Ta: number
): { k: number } {
  if (T0 === Ta) {
    throw new Error("Initial temperature T₀ must differ from ambient temperature Tₐ.");
  }
  if (t1 <= 0) {
    throw new Error("Calibration time t₁ must be greater than 0.");
  }
  const ratio = (T1 - Ta) / (T0 - Ta);
  if (ratio <= 0) {
    throw new Error(
      "Invalid temperatures: (T₁ - Tₐ) / (T₀ - Tₐ) must be positive. Check that T₁ and T₀ are on the same side of Tₐ."
    );
  }
  const k = -(1 / t1) * Math.log(ratio);
  if (k <= 0) {
    throw new Error(
      "Computed k is non-positive. Ensure the object is cooling (or heating) toward ambient temperature."
    );
  }
  return { k };
}

/**
 * Single RK4 step for dT/dt = -k * (T - Ta(t))
 */
export function rk4Step(
  T: number,
  t: number,
  dt: number,
  k: number,
  taFn: (t: number) => number
): number {
  const f = (Tv: number, tv: number) => -k * (Tv - taFn(tv));
  const k1 = f(T, t);
  const k2 = f(T + (dt / 2) * k1, t + dt / 2);
  const k3 = f(T + (dt / 2) * k2, t + dt / 2);
  const k4 = f(T + dt * k3, t + dt);
  return T + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/**
 * Integrate ODE from 0 to tMax, return array of {t, T}
 */
export function integrateRK4(
  T0: number,
  tMax: number,
  dt: number,
  k: number,
  taFn: (t: number) => number
): DataPoint[] {
  const points: DataPoint[] = [];
  let T = T0;
  let t = 0;
  points.push({ t, T });
  while (t < tMax - 1e-12) {
    const step = Math.min(dt, tMax - t);
    T = rk4Step(T, t, step, k, taFn);
    t += step;
    points.push({ t, T });
  }
  return points;
}

/**
 * Bisection root-finder to find k such that T_sim(t1; k) = T1.
 * Used for non-constant ambient temperature.
 */
export function findKByFitting(
  T0: number,
  t1: number,
  T1: number,
  taFn: (t: number) => number
): { k: number } {
  if (t1 <= 0) {
    throw new Error("Calibration time t₁ must be greater than 0.");
  }

  const dt = t1 / 1000;

  const simulate = (k: number): number => {
    const pts = integrateRK4(T0, t1, dt, k, taFn);
    return pts[pts.length - 1].T - T1;
  };

  // Bracket search
  let kLow = 1e-6;
  let kHigh = 100;
  let fLow = simulate(kLow);
  let fHigh = simulate(kHigh);

  if (fLow * fHigh > 0) {
    // Try expanding bracket
    let found = false;
    for (let kTry = 0.001; kTry <= 200; kTry += 0.5) {
      const fTry = simulate(kTry);
      if (fLow * fTry < 0) {
        kHigh = kTry;
        fHigh = fTry;
        found = true;
        break;
      }
      if (fTry * simulate(kTry + 0.5) < 0) {
        kLow = kTry;
        fLow = fTry;
        kHigh = kTry + 0.5;
        fHigh = simulate(kHigh);
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(
        "Could not find a valid k bracket. Check that T₁ is reachable from T₀ under the given ambient temperature function."
      );
    }
  }

  // Bisection
  const TOL = 1e-8;
  const MAX_ITER = 100;
  for (let i = 0; i < MAX_ITER; i++) {
    const kMid = (kLow + kHigh) / 2;
    const fMid = simulate(kMid);
    if (Math.abs(fMid) < TOL || (kHigh - kLow) / 2 < TOL) {
      return { k: kMid };
    }
    if (fLow * fMid < 0) {
      kHigh = kMid;
      fHigh = fMid;
    } else {
      kLow = kMid;
      fLow = fMid;
    }
  }

  return { k: (kLow + kHigh) / 2 };
}
