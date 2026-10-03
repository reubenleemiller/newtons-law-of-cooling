import { useState } from "react";
import { runWithMinDelay } from "./lib/runWithMinDelay";
import Plot from "react-plotly.js";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import {
  computeKConstant,
  findKByFitting,
  integrateRK4,
  computeAnalyticTargetTime,
  findFirstCrossing,
  parseAmbientExpression,
  latexToExpression,
  type DataPoint,
} from "./lib/model";
import { toLatexFrac } from "./lib/format";
import "./App.css";

type AmbientMode = "constant" | "function";
type FunctionType = "sinusoid" | "linear" | "custom";
type AmbientInputMode = "expression" | "latex";

interface SinusoidParams {
  A: number;
  B: number;
  omega: number;
  phi: number;
}

interface LinearParams {
  a: number;
  b: number;
}

interface PlotData {
  tArr: number[];
  TArr: number[];
  TaArr: number[];
  k: number;
  isConstant: boolean;
  T0n: number;
  t1n: number;
  T1n: number;
  TaN: number;
  tHit: number | null;
  tHitBeyondWindow: boolean;
  tMaxN: number;
}

function buildTaFn(
  ambientMode: AmbientMode,
  Ta: number,
  funcType: FunctionType,
  sinParams: SinusoidParams,
  linParams: LinearParams,
  customFn: ((t: number) => number) | null
): (t: number) => number {
  if (ambientMode === "constant") {
    return () => Ta;
  }
  if (funcType === "sinusoid") {
    const { A, B, omega, phi } = sinParams;
    return (t: number) => A + B * Math.sin(omega * t + phi);
  }
  if (funcType === "linear") {
    const { a, b } = linParams;
    return (t: number) => a + b * t;
  }
  // custom
  if (!customFn) throw new Error("Custom ambient expression must be provided and valid.");
  return customFn;
}

/** Format number for LaTeX display: avoid excessive decimals */
function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toPrecision(6)).toString();
}

export default function App() {
  const [T0, setT0] = useState<string>("100");
  const [t1, setT1] = useState<string>("10");
  const [T1, setT1Val] = useState<string>("60");
  const [ambientMode, setAmbientMode] = useState<AmbientMode>("constant");
  const [Ta, setTa] = useState<string>("20");
  const [funcType, setFuncType] = useState<FunctionType>("sinusoid");

  const [sinA, setSinA] = useState<string>("20");
  const [sinB, setSinB] = useState<string>("5");
  const [sinOmega, setSinOmega] = useState<string>("0.1");
  const [sinPhi, setSinPhi] = useState<string>("0");

  const [linA, setLinA] = useState<string>("20");
  const [linB, setLinB] = useState<string>("0.5");

  const [customExpr, setCustomExpr] = useState<string>("20 + 5*sin(0.1*t)");
  const [ambientInputMode, setAmbientInputMode] = useState<AmbientInputMode>("expression");

  const [tMax, setTMax] = useState<string>("60");
  const [nPoints, setNPoints] = useState<string>("300");

  const [tTarget, setTTarget] = useState<string>("");

  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exprError, setExprError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompute = () => {
    setError(null);
    setExprError(null);
    setLoading(true);
    // Wrap computation in a Promise so runWithMinDelay can gate the result.
    // setTimeout(0) lets React flush the loading state before the
    // synchronous computation blocks the thread.
    const computePromise = new Promise<PlotData>((resolve, reject) => {
      setTimeout(() => {
        try {
        const T0n = parseFloat(T0);
        const t1n = parseFloat(t1);
        const T1n = parseFloat(T1);
        const tMaxN = parseFloat(tMax);
        const nPtsN = Math.max(2, Math.round(parseFloat(nPoints)));

        if ([T0n, t1n, T1n, tMaxN, nPtsN].some(isNaN)) {
          throw new Error("All numeric fields must be valid numbers.");
        }
        if (tMaxN <= 0) throw new Error("Plot duration tMax must be positive.");

        const sinParams: SinusoidParams = {
          A: parseFloat(sinA),
          B: parseFloat(sinB),
          omega: parseFloat(sinOmega),
          phi: parseFloat(sinPhi),
        };
        const linParams: LinearParams = {
          a: parseFloat(linA),
          b: parseFloat(linB),
        };

        let customFn: ((t: number) => number) | null = null;
        if (ambientMode === "function" && funcType === "custom") {
          let exprStr = customExpr.trim();
          if (ambientInputMode === "latex") {
            exprStr = latexToExpression(exprStr);
          }
          try {
            customFn = parseAmbientExpression(exprStr);
          } catch (e) {
            setExprError((e as Error).message);
            throw new Error("Invalid ambient expression: " + (e as Error).message);
          }
        }

        if (ambientMode === "function" && funcType !== "custom") {
          const params =
            funcType === "sinusoid"
              ? Object.values(sinParams)
              : Object.values(linParams);
          if (params.some(isNaN))
            throw new Error(
              "All ambient function parameters must be valid numbers."
            );
        }

        const TaN = parseFloat(Ta);
        if (ambientMode === "constant" && isNaN(TaN)) {
          throw new Error("Ambient temperature Tₐ must be a valid number.");
        }

        const taFn = buildTaFn(ambientMode, TaN, funcType, sinParams, linParams, customFn);

        let k: number;
        if (ambientMode === "constant") {
          ({ k } = computeKConstant(T0n, t1n, T1n, TaN));
        } else {
          ({ k } = findKByFitting(T0n, t1n, T1n, taFn));
        }

        const dt = tMaxN / (nPtsN - 1);
        const pts: DataPoint[] = integrateRK4(T0n, tMaxN, dt, k, taFn);

        const tArr = pts.map((p) => p.t);
        const TArr = pts.map((p) => p.T);
        const TaArr = tArr.map((t) => taFn(t));

        // Compute target-temperature hit time
        let tHit: number | null = null;
        let tHitBeyondWindow = false;
        const tTargetN = parseFloat(tTarget);
        if (!isNaN(tTargetN)) {
          if (ambientMode === "constant") {
            tHit = computeAnalyticTargetTime(tTargetN, T0n, TaN, k);
            if (tHit !== null && tHit > tMaxN) {
              tHitBeyondWindow = true;
            }
          } else {
            tHit = findFirstCrossing(pts, tTargetN, k, taFn);
          }
        }

        resolve({
          tArr,
          TArr,
          TaArr,
          k,
          isConstant: ambientMode === "constant",
          T0n,
          t1n,
          T1n,
          TaN,
          tHit,
          tHitBeyondWindow,
          tMaxN,
        });
        } catch (err) {
          reject(err);
        }
      }, 0);
    });

    runWithMinDelay(computePromise).then((data) => {
      setPlotData(data);
      setLoading(false);
    }).catch((err) => {
      setError((err as Error).message);
      setPlotData(null);
      setLoading(false);
    });
  };

  /** Build LaTeX string for k in exact log/fraction form */
  const buildKLatex = (data: PlotData): string => {
    const { T0n, t1n, T1n, TaN } = data;
    const num = toLatexFrac(T1n - TaN);
    const den = toLatexFrac(T0n - TaN);
    return `k = -\\frac{1}{${toLatexFrac(t1n)}}\\ln\\!\\left(\\frac{${num}}{${den}}\\right)`;
  };

  /** Build LaTeX for T(t) using r form */
  const buildTLatex = (data: PlotData): string => {
    const { T0n, t1n, TaN, T1n } = data;
    const r = (T1n - TaN) / (T0n - TaN);
    const rFmt = toLatexFrac(r);
    // Wrap fraction base in parentheses so the exponent attaches cleanly
    const rBase = rFmt.startsWith("\\frac") ? `\\left(${rFmt}\\right)` : rFmt;
    return `T(t) = ${toLatexFrac(TaN)} + ${toLatexFrac(T0n - TaN)} \\cdot ${rBase}^{\\,t/${toLatexFrac(t1n)}}`;
  };

  /** Build LaTeX for the analytic t_hit formula */
  const buildTHitLatex = (data: PlotData, tTarget: number): string => {
    return `t_{hit} = -\\frac{1}{k}\\ln\\!\\left(\\frac{${toLatexFrac(tTarget - data.TaN)}}{${toLatexFrac(data.T0n - data.TaN)}}\\right)`;
  };

  const tTargetN = parseFloat(tTarget);
  const showTargetSection = tTarget.trim() !== "";

  return (
    <div className="app-container">
      <h1>Newton's Law of Cooling</h1>
      <p className="subtitle">
        Visualize how an object's temperature changes over time toward its
        surroundings.
      </p>

      <div className="card">
        <h2>Parameters</h2>

        <div className="form-grid">
          <label>
            T₀ — Initial Temperature
            <input
              type="number"
              value={T0}
              onChange={(e) => setT0(e.target.value)}
            />
          </label>
          <label>
            t₁ — Calibration Time
            <input
              type="number"
              value={t1}
              min="0.001"
              step="any"
              onChange={(e) => setT1(e.target.value)}
            />
          </label>
          <label>
            T₁ — Temperature at t₁
            <input
              type="number"
              value={T1}
              onChange={(e) => setT1Val(e.target.value)}
            />
          </label>
        </div>

        <div className="section">
          <h3>Ambient Temperature</h3>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                value="constant"
                checked={ambientMode === "constant"}
                onChange={() => setAmbientMode("constant")}
              />
              Constant
            </label>
            <label>
              <input
                type="radio"
                value="function"
                checked={ambientMode === "function"}
                onChange={() => setAmbientMode("function")}
              />
              Function
            </label>
          </div>

          {ambientMode === "constant" && (
            <div className="form-grid">
              <label>
                Tₐ — Ambient Temperature
                <input
                  type="number"
                  value={Ta}
                  onChange={(e) => setTa(e.target.value)}
                />
              </label>
            </div>
          )}

          {ambientMode === "function" && (
            <div className="function-inputs">
              <label>
                Function type
                <select
                  value={funcType}
                  onChange={(e) =>
                    setFuncType(e.target.value as FunctionType)
                  }
                >
                  <option value="sinusoid">
                    Sinusoid: Tₐ(t) = A + B·sin(ω·t + φ)
                  </option>
                  <option value="linear">Linear: Tₐ(t) = a + b·t</option>
                  <option value="custom">Custom expression</option>
                </select>
              </label>

              {funcType === "sinusoid" && (
                <div className="form-grid">
                  <label>
                    A (offset)
                    <input
                      type="number"
                      value={sinA}
                      onChange={(e) => setSinA(e.target.value)}
                    />
                  </label>
                  <label>
                    B (amplitude)
                    <input
                      type="number"
                      value={sinB}
                      onChange={(e) => setSinB(e.target.value)}
                    />
                  </label>
                  <label>
                    ω (angular frequency)
                    <input
                      type="number"
                      value={sinOmega}
                      step="any"
                      onChange={(e) => setSinOmega(e.target.value)}
                    />
                  </label>
                  <label>
                    φ (phase)
                    <input
                      type="number"
                      value={sinPhi}
                      step="any"
                      onChange={(e) => setSinPhi(e.target.value)}
                    />
                  </label>
                </div>
              )}

              {funcType === "linear" && (
                <div className="form-grid">
                  <label>
                    a (intercept)
                    <input
                      type="number"
                      value={linA}
                      onChange={(e) => setLinA(e.target.value)}
                    />
                  </label>
                  <label>
                    b (slope)
                    <input
                      type="number"
                      value={linB}
                      step="any"
                      onChange={(e) => setLinB(e.target.value)}
                    />
                  </label>
                </div>
              )}

              {funcType === "custom" && (
                <div className="custom-expr-section">
                  <div className="radio-group input-mode-toggle">
                    <span className="toggle-label">Input format:</span>
                    <label>
                      <input
                        type="radio"
                        value="expression"
                        checked={ambientInputMode === "expression"}
                        onChange={() => setAmbientInputMode("expression")}
                      />
                      Expression (e.g. 20 + 5*sin(0.1*t))
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="latex"
                        checked={ambientInputMode === "latex"}
                        onChange={() => setAmbientInputMode("latex")}
                      />
                      LaTeX subset (e.g. 20 + 5\sin(0.1 t))
                    </label>
                  </div>
                  <label>
                    Tₐ(t) expression (variable: <code>t</code>)
                    <input
                      type="text"
                      className="expr-input"
                      value={customExpr}
                      onChange={(e) => {
                        setCustomExpr(e.target.value);
                        setExprError(null);
                      }}
                      placeholder={
                        ambientInputMode === "expression"
                          ? "e.g. 20 + 5*sin(0.1*t)"
                          : "e.g. 20 + 5\\sin(0.1 t)"
                      }
                    />
                  </label>
                  {exprError && (
                    <div className="expr-error">{exprError}</div>
                  )}
                  <p className="expr-hint">
                    Allowed: variable <code>t</code>; functions{" "}
                    <code>sin, cos, tan, exp, log, sqrt, pow, abs</code>;
                    constants <code>pi, e</code>.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3>Plot Settings</h3>
          <div className="form-grid">
            <label>
              tMax — Plot Duration
              <input
                type="number"
                value={tMax}
                min="0.001"
                step="any"
                onChange={(e) => setTMax(e.target.value)}
              />
            </label>
            <label>
              nPoints — Number of Points
              <input
                type="number"
                value={nPoints}
                min="2"
                step="1"
                onChange={(e) => setNPoints(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="section">
          <h3>Target Temperature (optional)</h3>
          <div className="form-grid">
            <label>
              T<sub>target</sub> — Find first hit time
              <input
                type="number"
                value={tTarget}
                step="any"
                placeholder="e.g. 50"
                onChange={(e) => setTTarget(e.target.value)}
              />
            </label>
          </div>
        </div>

        <button
          className="compute-btn"
          onClick={handleCompute}
          disabled={loading}
        >
          {loading ? (
            <span className="btn-spinner" aria-hidden="true" />
          ) : (
            <>Compute &amp; Plot</>
          )}
        </button>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      {(plotData || loading) && (
        <div className="card results-card">
          <h2>Results</h2>

          {plotData && !loading && (
            <>
              <p className="k-display">
                Cooling constant (decimal):{" "}
                <strong>k ≈ {plotData.k.toExponential(4)}</strong>
              </p>

              {plotData.isConstant && (
                <>
                  <div className="formula-box">
                    <div className="formula-row">
                      <span className="formula-label">Cooling constant (exact):</span>
                      <BlockMath math={buildKLatex(plotData)} />
                    </div>
                  </div>
                  <div className="formula-box">
                    <div className="formula-row">
                      <span className="formula-label">Solution (power form):</span>
                      <BlockMath math={buildTLatex(plotData)} />
                    </div>
                  </div>
                </>
              )}

              {showTargetSection && !isNaN(tTargetN) && (
                <div className="target-result">
                  {plotData.tHit !== null ? (
                    <p>
                      First time T(t) = <strong>{fmt(tTargetN)}</strong>:{" "}
                      <strong>
                        t<sub>hit</sub> ≈ {plotData.tHit.toFixed(4)}
                      </strong>
                      {plotData.isConstant && (
                        <span className="formula-inline">
                          {" "}(
                          <InlineMath math={buildTHitLatex(plotData, tTargetN)} />
                          )
                        </span>
                      )}
                      {plotData.tHitBeyondWindow && (
                        <span className="numeric-note"> — beyond plot window (tMax = {plotData.tMaxN})</span>
                      )}
                      {!plotData.isConstant && (
                        <span className="numeric-note"> (numerical, first crossing in plot window)</span>
                      )}
                    </p>
                  ) : (
                    <p className="no-crossing">
                      {plotData.isConstant
                        ? `T(t) = ${fmt(tTargetN)} is not reached: target is outside the range [Tₐ, T₀].`
                        : `T(t) = ${fmt(tTargetN)} is not crossed in [0, ${plotData.tMaxN}]. Try increasing tMax.`}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="plot-wrapper">
            {loading && (
              <div
                className="plot-loading-overlay"
                role="status"
                aria-label="Computing plot data"
              >
                <span className="plot-spinner" aria-hidden="true" />
                <span className="plot-loading-text">Computing…</span>
              </div>
            )}
            {plotData && !loading && (
              <Plot
                data={[
                  {
                    x: plotData.tArr,
                    y: plotData.TArr,
                    type: "scatter",
                    mode: "lines",
                    name: "T(t) — Object Temperature",
                    line: { color: "#e06c75", width: 2 },
                  },
                  {
                    x: plotData.tArr,
                    y: plotData.TaArr,
                    type: "scatter",
                    mode: "lines",
                    name: "Tₐ(t) — Ambient Temperature",
                    line: { color: "#61afef", width: 2, dash: "dash" },
                  },
                  ...(plotData.tHit !== null && !plotData.tHitBeyondWindow
                    ? [
                        {
                          x: [plotData.tHit],
                          y: [tTargetN],
                          type: "scatter" as const,
                          mode: "markers" as const,
                          name: `t_hit ≈ ${plotData.tHit.toFixed(3)}`,
                          marker: { color: "#a6e3a1", size: 10, symbol: "diamond" },
                        },
                        {
                          x: [plotData.tHit, plotData.tHit],
                          y: [
                            Math.min(...plotData.TArr, ...plotData.TaArr) - 5,
                            Math.max(...plotData.TArr, ...plotData.TaArr) + 5,
                          ],
                          type: "scatter" as const,
                          mode: "lines" as const,
                          name: "t_hit",
                          line: { color: "#a6e3a1", width: 1, dash: "dot" as const },
                          showlegend: false,
                        },
                      ]
                    : []),
                ]}
                layout={{
                  title: { text: "Newton's Law of Cooling" },
                  xaxis: { title: { text: "Time (t)" } },
                  yaxis: { title: { text: "Temperature" } },
                  legend: {
                    x: 0.5,
                    xanchor: "center",
                    y: -0.2,
                    orientation: "h",
                  },
                  autosize: true,
                  margin: { l: 60, r: 20, t: 50, b: 80 },
                  paper_bgcolor: "#1e1e2e",
                  plot_bgcolor: "#1e1e2e",
                  font: { color: "#cdd6f4" },
                }}
                useResizeHandler
                style={{ width: "100%", minHeight: "420px" }}
              />
            )}
          </div>
        </div>
      )}

      {!plotData && !error && !loading && (
        <div className="placeholder">
          <p>
            Configure parameters above and click{" "}
            <strong>Compute &amp; Plot</strong> to visualize.
          </p>
        </div>
      )}
    </div>
  );
}
