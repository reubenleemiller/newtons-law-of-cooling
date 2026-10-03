import { describe, it, expect } from "vitest";
import { gcd, toLatexFrac } from "./format";

describe("gcd", () => {
  it("returns correct GCD for basic cases", () => {
    expect(gcd(4, 6)).toBe(2);
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(7, 13)).toBe(1);
    expect(gcd(15, 5)).toBe(5);
  });

  it("handles zero inputs", () => {
    expect(gcd(0, 5)).toBe(5);
    expect(gcd(5, 0)).toBe(5);
  });

  it("handles equal values", () => {
    expect(gcd(7, 7)).toBe(7);
  });

  it("handles negative inputs by taking absolute value", () => {
    expect(gcd(-4, 6)).toBe(2);
    expect(gcd(12, -8)).toBe(4);
  });
});

describe("toLatexFrac", () => {
  it("returns integer strings for whole numbers", () => {
    expect(toLatexFrac(0)).toBe("0");
    expect(toLatexFrac(3)).toBe("3");
    expect(toLatexFrac(100)).toBe("100");
  });

  it("handles negative integers", () => {
    expect(toLatexFrac(-5)).toBe("-5");
    expect(toLatexFrac(-100)).toBe("-100");
  });

  it("converts 0.5 to \\frac{1}{2}", () => {
    expect(toLatexFrac(0.5)).toBe("\\frac{1}{2}");
  });

  it("converts 1/3 repeating decimal to \\frac{1}{3}", () => {
    expect(toLatexFrac(1 / 3)).toBe("\\frac{1}{3}");
  });

  it("converts 2/3 to \\frac{2}{3}", () => {
    expect(toLatexFrac(2 / 3)).toBe("\\frac{2}{3}");
  });

  it("reduces fractions: 2/4 → \\frac{1}{2}", () => {
    expect(toLatexFrac(2 / 4)).toBe("\\frac{1}{2}");
  });

  it("reduces fractions: 6/9 → \\frac{2}{3}", () => {
    expect(toLatexFrac(6 / 9)).toBe("\\frac{2}{3}");
  });

  it("converts 0.625 to \\frac{5}{8}", () => {
    expect(toLatexFrac(0.625)).toBe("\\frac{5}{8}");
  });

  it("converts 0.375 to \\frac{3}{8}", () => {
    expect(toLatexFrac(0.375)).toBe("\\frac{3}{8}");
  });

  it("converts 2.5 to \\frac{5}{2}", () => {
    expect(toLatexFrac(2.5)).toBe("\\frac{5}{2}");
  });

  it("handles negative fractions", () => {
    expect(toLatexFrac(-0.5)).toBe("-\\frac{1}{2}");
    expect(toLatexFrac(-1 / 3)).toBe("-\\frac{1}{3}");
    expect(toLatexFrac(-0.625)).toBe("-\\frac{5}{8}");
  });

  it("returns integer when denominator reduces to 1", () => {
    expect(toLatexFrac(4 / 2)).toBe("2");
    expect(toLatexFrac(9 / 3)).toBe("3");
  });

  it("handles 1/7 repeating decimal", () => {
    expect(toLatexFrac(1 / 7)).toBe("\\frac{1}{7}");
  });

  it("handles 5/6 repeating decimal", () => {
    expect(toLatexFrac(5 / 6)).toBe("\\frac{5}{6}");
  });

  it("handles typical r ratio (T1-Ta)/(T0-Ta) = 40/80", () => {
    expect(toLatexFrac(40 / 80)).toBe("\\frac{1}{2}");
  });

  it("handles Infinity", () => {
    expect(toLatexFrac(Infinity)).toBe("Infinity");
  });

  it("handles NaN", () => {
    expect(toLatexFrac(NaN)).toBe("NaN");
  });

  it("respects custom maxDenom: falls back to decimal when fraction exceeds budget", () => {
    // 1/3 needs denominator 3, which exceeds maxDenom=2 → fallback decimal
    const result = toLatexFrac(1 / 3, 2);
    expect(result).not.toBe("\\frac{1}{3}");
    // Verify the fallback is a 6-sig-fig decimal string
    expect(result).toBe("0.333333");
  });
});
