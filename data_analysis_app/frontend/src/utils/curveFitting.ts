/**
 * Curve fitting utilities for trend lines.
 *
 * Both fitters below use the same strategy: grid-search the one parameter the
 * model is nonlinear in, and solve for the remaining parameter(s) via closed-form
 * least squares at each grid point (the model is linear in those, for any fixed
 * value of the nonlinear one). This guarantees the global optimum over the grid -
 * no local minima, no hand-tuned learning rate/iteration count, and critically, no
 * floor/regularization bias pulling the result away from what the data actually
 * supports. Same idea as the backend's `calibrate_effort_curve` (grid-search the
 * curve exponent, closed-form OLS for the linear part).
 */

function logSpace(min: number, max: number, count: number): number[] {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const step = (logMax - logMin) / (count - 1);
  const values = [];
  for (let i = 0; i < count; i++) {
    values.push(Math.exp(logMin + i * step));
  }
  return values;
}

/**
 * Fit an exponential saturation curve (diminishing returns)
 * Model: y = C * (1 - e^(-k*x)), k > 0
 * Passes through origin (0,0) and approaches asymptote C
 */
export function fitExponentialSaturation(data: Array<{ x: number; y: number }>) {
  if (data.length < 2) {
    return null;
  }

  // Filter out invalid points
  const validData = data.filter(d =>
    isFinite(d.x) && isFinite(d.y) && d.x >= 0 && d.y >= 0
  );

  if (validData.length < 2) {
    return null;
  }

  const xValues = validData.map(d => d.x);
  const yValues = validData.map(d => d.y);
  const xMax = Math.max(...xValues);

  if (xMax <= 0) {
    return null;
  }

  // For a fixed k, y = C * basis(x) is linear in C - solve it exactly via OLS
  // rather than tracking it through gradient descent.
  const solveForC = (k: number) => {
    let sumBasisSq = 0;
    let sumBasisY = 0;
    for (const point of validData) {
      const basis = 1 - Math.exp(-k * point.x);
      sumBasisSq += basis * basis;
      sumBasisY += basis * point.y;
    }
    if (sumBasisSq < 1e-12) {
      return null;
    }
    const C = sumBasisY / sumBasisSq;
    let sse = 0;
    for (const point of validData) {
      const basis = 1 - Math.exp(-k * point.x);
      const residual = C * basis - point.y;
      sse += residual * residual;
    }
    return { C, sse };
  };

  // Wide grid: from a very gentle near-linear approach to a very steep one that
  // saturates almost immediately, relative to the data's own x-range.
  const searchGrid = (kMin: number, kMax: number, count: number) => {
    let best: { k: number; C: number; sse: number } | null = null;
    for (const k of logSpace(kMin, kMax, count)) {
      const result = solveForC(k);
      if (result && isFinite(result.sse) && (!best || result.sse < best.sse)) {
        best = { k, C: result.C, sse: result.sse };
      }
    }
    return best;
  };

  const coarse = searchGrid(0.001 / xMax, 100 / xMax, 400);
  if (!coarse) {
    return null;
  }

  // Finer grid centered on the coarse optimum for extra precision.
  const fine = searchGrid(coarse.k / 5, coarse.k * 5, 300);
  const best = fine && fine.sse < coarse.sse ? fine : coarse;

  const { C, k } = best;

  // Calculate R²
  const yMean = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
  let ssTotal = 0;
  for (const point of validData) {
    ssTotal += Math.pow(point.y - yMean, 2);
  }
  const rSquared = ssTotal > 0 ? Math.max(0, 1 - best.sse / ssTotal) : 0;

  // Generate curve points
  const numPoints = 100;
  const step = xMax / numPoints;
  const curvePoints = [];
  for (let i = 0; i <= numPoints; i++) {
    const x = i * step;
    const y = C * (1 - Math.exp(-k * x));
    curvePoints.push({ x, y });
  }

  return {
    parameters: { C, k },
    rSquared,
    curvePoints,
    equation: `y = ${C.toFixed(2)} * (1 - e^(-${k.toFixed(4)}*x))`,
  };
}

/**
 * Fit an exponential decay curve to data points
 * Model: y = a * e^(-b*x) + c
 * Decreases steeply at first, then levels off - good for inverse relationships
 */
export function fitExponentialDecay(data: Array<{ x: number; y: number }>) {
  if (data.length < 3) {
    return null;
  }

  // Filter out invalid points
  const validData = data.filter(d =>
    isFinite(d.x) && isFinite(d.y) && d.x >= 0 && d.y >= 0
  );

  if (validData.length < 3) {
    return null;
  }

  const xValues = validData.map(d => d.x);
  const yValues = validData.map(d => d.y);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xRange = xMax - xMin;

  if (xRange <= 0) {
    return null;
  }

  const n = validData.length;

  // For a fixed b, y = a*e^(-b*x) + c is linear in (a, c) - solve the 2x2 normal
  // equations exactly rather than tracking both through gradient descent.
  const solveForAC = (b: number) => {
    let sumBasisSq = 0;
    let sumBasis = 0;
    let sumBasisY = 0;
    let sumY = 0;
    for (const point of validData) {
      const basis = Math.exp(-b * point.x);
      sumBasisSq += basis * basis;
      sumBasis += basis;
      sumBasisY += basis * point.y;
      sumY += point.y;
    }
    const determinant = sumBasisSq * n - sumBasis * sumBasis;
    if (Math.abs(determinant) < 1e-12) {
      return null;
    }
    const a = (sumBasisY * n - sumBasis * sumY) / determinant;
    const c = (sumBasisSq * sumY - sumBasis * sumBasisY) / determinant;
    let sse = 0;
    for (const point of validData) {
      const residual = a * Math.exp(-b * point.x) + c - point.y;
      sse += residual * residual;
    }
    return { a, c, sse };
  };

  const searchGrid = (bMin: number, bMax: number, count: number) => {
    let best: { b: number; a: number; c: number; sse: number } | null = null;
    for (const b of logSpace(bMin, bMax, count)) {
      const result = solveForAC(b);
      if (result && isFinite(result.sse) && (!best || result.sse < best.sse)) {
        best = { b, a: result.a, c: result.c, sse: result.sse };
      }
    }
    return best;
  };

  const coarse = searchGrid(0.001 / xRange, 100 / xRange, 400);
  if (!coarse) {
    return null;
  }

  const fine = searchGrid(coarse.b / 5, coarse.b * 5, 300);
  const best = fine && fine.sse < coarse.sse ? fine : coarse;

  const { a, b, c } = best;

  // Calculate R²
  const yMean = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
  let ssTotal = 0;
  for (const point of validData) {
    ssTotal += Math.pow(point.y - yMean, 2);
  }
  const rSquared = ssTotal > 0 ? Math.max(0, 1 - best.sse / ssTotal) : 0;

  // Generate curve points
  const numPoints = 100;
  const step = xRange / numPoints;
  const curvePoints = [];
  for (let i = 0; i <= numPoints; i++) {
    const x = xMin + i * step;
    const y = a * Math.exp(-b * x) + c;
    curvePoints.push({ x, y });
  }

  return {
    parameters: { a, b, c },
    rSquared,
    curvePoints,
    equation: `y = ${a.toFixed(2)} * e^(-${b.toFixed(4)}*x) + ${c.toFixed(2)}`,
  };
}
