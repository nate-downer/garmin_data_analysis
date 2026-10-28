/**
 * Curve fitting utilities for trend lines
 */

/**
 * Fit an exponential saturation curve (diminishing returns)
 * Model: y = C * (1 - e^(-k*x)), k > 0
 * Passes through origin (0,0) and approaches asymptote C
 *
 * @param asymptoteMultiplier - Controls initial C guess (default 5). Lower for plots with lower asymptotes
 * @param slopeMultiplier - Controls initial k guess (default 0.1). Higher for steeper initial slopes
 * @param minAsymptoteMultiplier - Minimum allowed C as multiple of yMax (default 1.5). Lower for looser bounds
 * @param regularizationStrength - How strongly to push C up (default 0.001). Lower for looser fits
 */
export function fitExponentialSaturation(
  data: Array<{ x: number; y: number }>,
  asymptoteMultiplier: number = 5,
  slopeMultiplier: number = 0.1,
  minAsymptoteMultiplier: number = 1.5,
  regularizationStrength: number = 0.001
) {
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

  // Initial parameter estimates
  const xValues = validData.map(d => d.x);
  const yValues = validData.map(d => d.y);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMax = Math.max(...yValues);

  // Initial guesses - use provided multipliers for different plot types
  let C = yMax * asymptoteMultiplier; // asymptote height
  let k = slopeMultiplier / xMax; // initial slope steepness

  // Adaptive gradient descent with regularization
  let learningRate = 0.05;
  const iterations = 5000;
  let prevError = Infinity;

  // Regularization weights to push towards desired characteristics
  const lambdaC = regularizationStrength; // penalty for low C (encourages high asymptote)
  const lambdaK = 0.01;  // penalty for high k (encourages gentle curve)

  for (let iter = 0; iter < iterations; iter++) {
    let gradC = 0;
    let gradK = 0;
    let totalError = 0;

    for (const point of validData) {
      const expTerm = Math.exp(-k * point.x);
      const predicted = C * (1 - expTerm);
      const error = predicted - point.y;

      gradC += error * (1 - expTerm);
      gradK += error * C * point.x * expTerm;
      totalError += error * error;
    }

    const n = validData.length;

    // Add regularization gradients
    // Penalize low C (subtract from gradient to push C higher)
    gradC -= lambdaC * (yMax * 3 - C);
    // Penalize high k (add to gradient to push k lower)
    gradK += lambdaK * k;

    // Adaptive learning rate
    if (totalError < prevError) {
      learningRate *= 1.05;
    } else {
      learningRate *= 0.5;
    }
    learningRate = Math.min(Math.max(learningRate, 0.0001), 0.3);
    prevError = totalError;

    C -= (learningRate * gradC) / n;
    k -= (learningRate * gradK) / n;

    // Bounds: favor high C and low k (configurable via parameters)
    C = Math.max(yMax * minAsymptoteMultiplier, Math.min(C, yMax * 20));
    k = Math.max(0.00001, Math.min(k, 3.0 / xMax)); // slightly relaxed k limit
  }

  // Calculate R² properly
  const yMean = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
  let ssTotal = 0;
  let ssResidual = 0;

  for (const point of validData) {
    const predicted = C * (1 - Math.exp(-k * point.x));
    ssTotal += Math.pow(point.y - yMean, 2);
    ssResidual += Math.pow(point.y - predicted, 2);
  }

  // Protect against division by zero or negative R²
  let rSquared = 0;
  if (ssTotal > 0) {
    rSquared = Math.max(0, 1 - (ssResidual / ssTotal));
  }

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

  // Initial parameter estimates
  const xValues = validData.map(d => d.x);
  const yValues = validData.map(d => d.y);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  // Initial guesses
  let a = yMax - yMin;
  let b = 1 / (xMax - xMin);
  let c = yMin;

  // Simple gradient descent to optimize parameters
  const learningRate = 0.01;
  const iterations = 1000;

  for (let iter = 0; iter < iterations; iter++) {
    let gradA = 0;
    let gradB = 0;
    let gradC = 0;

    for (const point of validData) {
      const predicted = a * Math.exp(-b * point.x) + c;
      const error = predicted - point.y;

      gradA += error * Math.exp(-b * point.x);
      gradB += error * a * (-point.x) * Math.exp(-b * point.x);
      gradC += error;
    }

    const n = validData.length;
    a -= (learningRate * gradA) / n;
    b -= (learningRate * gradB) / n;
    c -= (learningRate * gradC) / n;

    // Ensure parameters stay positive
    a = Math.max(0.001, a);
    b = Math.max(0.001, b);
    c = Math.max(0, c);
  }

  // Calculate R² (coefficient of determination)
  const yMean = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
  let ssTotal = 0;
  let ssResidual = 0;

  for (const point of validData) {
    const predicted = a * Math.exp(-b * point.x) + c;
    ssTotal += Math.pow(point.y - yMean, 2);
    ssResidual += Math.pow(point.y - predicted, 2);
  }

  const rSquared = 1 - (ssResidual / ssTotal);

  // Generate curve points
  const numPoints = 100;
  const step = (xMax - xMin) / numPoints;
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
