/**
 * Format utilities for LaTeX rendering.
 */

/**
 * GCD of two non-negative integers (Euclidean algorithm).
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b > 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/**
 * Format a finite number as a LaTeX string with no decimals:
 * returns an integer literal or a reduced \frac{p}{q}.
 *
 * Uses the continued-fractions convergents algorithm to find the best
 * rational approximation p/q with q ≤ maxDenom and |x − p/q| < tol.
 * Falls back to a 6-sig-fig decimal string if no fraction is found
 * within the denominator budget.
 */
export function toLatexFrac(
  x: number,
  maxDenom = 10000,
  tol = 1e-7,
): string {
  if (!isFinite(x)) return String(x);

  const neg = x < 0;
  const abs = Math.abs(x);

  if (Number.isInteger(abs)) {
    return neg ? `-${abs}` : `${abs}`;
  }

  // Build continued-fraction convergents h/k → abs.
  // Initialise: h_{-1}=1, k_{-1}=0; h_0=floor(abs), k_0=1.
  const a0 = Math.floor(abs);
  let hPrev = 1,
    kPrev = 0;
  let h = a0,
    k = 1;
  let xi = abs;

  for (let i = 0; i < 64; i++) {
    if (Math.abs(abs - h / k) < tol) break;

    const rem = xi - Math.floor(xi);
    if (rem < 1e-15) break; // xi is an integer — no further improvement

    xi = 1 / rem;
    const a = Math.floor(xi);
    const hNext = a * h + hPrev;
    const kNext = a * k + kPrev;

    if (kNext > maxDenom) break;

    hPrev = h;
    kPrev = k;
    h = hNext;
    k = kNext;
  }

  if (Math.abs(abs - h / k) < tol) {
    const g = gcd(h, k);
    const p = h / g;
    const q = k / g;
    const sign = neg ? "-" : "";
    if (q === 1) return `${sign}${p}`;
    return `${sign}\\frac{${p}}{${q}}`;
  }

  // Fallback — no exact fraction found within the denominator budget.
  const rounded = parseFloat(abs.toPrecision(6));
  return neg ? `-${rounded}` : `${rounded}`;
}
