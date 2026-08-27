import {
  CvAnalysisError,
  type DunnFractionGrid,
  type DunnFractionPoint,
  type DunnRegularizationDiagnostics,
  type DunnSharedFractionResult
} from "./cvTypes";

export type {
  DunnRegularizationDiagnostics,
  DunnSharedFractionResult
} from "./cvTypes";

const BASE_LAMBDA_CANDIDATES = [
  1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1
] as const;
const MAX_ITERATIONS = 50_000;
const CANDIDATE_OPTIMALITY_TOLERANCE = 1e-5;
const OPTIMALITY_TOLERANCE = 1e-6;

interface SecondDifferenceRow {
  indices: [number, number, number];
  coefficients: [number, number, number];
}

interface SecondDifferenceOperator {
  rows: SecondDifferenceRow[];
  lipschitzBound: number;
}

interface ProjectedSolution {
  g: number[];
  iterations: number;
  converged: boolean;
  optimalityResidual: number;
}

export function secondDifferenceRoughness(values: number[], potentials?: number[]): number {
  const normalizedPotentials = potentials
    ? normalizePotentialGrid(potentials)
    : normalizedIndexGrid(values.length);
  validateValueLength(values, normalizedPotentials);
  return operatorRoughness(values, makeSecondDifferenceOperator(normalizedPotentials));
}

function operatorRoughness(values: number[], operator: SecondDifferenceOperator): number {
  let roughness = 0;
  for (const row of operator.rows) {
    const secondDifference = applySecondDifferenceRow(values, row);
    roughness += secondDifference * secondDifference;
  }
  return roughness;
}

export function optimizeSharedFraction(
  fractions: DunnFractionGrid,
  potentials: number[],
  smoothingMultiplier = 1
): DunnSharedFractionResult {
  const normalizedPotentials = validateInputs(fractions, potentials, smoothingMultiplier);
  const operator = makeSecondDifferenceOperator(normalizedPotentials);
  const combined = combineBranchTargets(fractions);
  const totalWeight = combined.weight.reduce((sum, value) => sum + value, 0);
  if (!(totalWeight > 0)) throw new CvAnalysisError("reconstructionFailed");
  const normalizedWeight = combined.weight.map((value) => value / totalWeight);
  const initializedTarget = initializeMissingTargets(combined.target, combined.weight);
  const candidates: Array<{
    baseLambda: number;
    solution: ProjectedSolution;
    meanFidelity: number;
    meanRoughness: number;
  }> = [];
  let warmStart = initializedTarget;

  for (const baseLambda of BASE_LAMBDA_CANDIDATES) {
    try {
      const solution = solveProjected(
        initializedTarget,
        normalizedWeight,
        baseLambda,
        operator,
        CANDIDATE_OPTIMALITY_TOLERANCE,
        warmStart
      );
      warmStart = solution.g;
      const candidate = {
        baseLambda,
        solution,
        meanFidelity: fidelityLoss(solution.g, initializedTarget, normalizedWeight),
        meanRoughness: operatorRoughness(solution.g, operator)
      };
      if (Number.isFinite(candidate.meanFidelity)
        && Number.isFinite(candidate.meanRoughness)
        && candidate.meanFidelity >= 0
        && candidate.meanRoughness >= 0) {
        candidates.push(candidate);
      }
    } catch (error) {
      if (error instanceof CvAnalysisError && error.code === "reconstructionFailed") continue;
      throw error;
    }
  }

  if (candidates.length === 0) throw new CvAnalysisError("reconstructionFailed");
  const selected = candidates[selectLCurveIndex(candidates)];
  const lambda = selected.baseLambda * smoothingMultiplier;
  const solution = solveProjected(
    initializedTarget,
    normalizedWeight,
    lambda,
    operator,
    OPTIMALITY_TOLERANCE,
    selected.solution.g
  );
  return {
    g: solution.g,
    diagnostics: makeDiagnostics(
      solution.g,
      initializedTarget,
      normalizedWeight,
      selected.baseLambda,
      lambda,
      smoothingMultiplier,
      operator,
      solution.iterations,
      solution.converged
    )
  };
}

function objective(
  g: number[],
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator
) {
  return fidelityLoss(g, target, weight) + lambda * operatorRoughness(g, operator);
}

function validateInputs(
  fractions: DunnFractionGrid,
  potentials: number[],
  smoothingMultiplier: number
): number[] {
  const pointCount = potentials.length;
  if (pointCount === 0
    || fractions.forward.length !== pointCount
    || fractions.reverse.length !== pointCount
    || potentials.some((potential) => !Number.isFinite(potential))
    || !Number.isFinite(smoothingMultiplier)
    || smoothingMultiplier < 1
    || smoothingMultiplier > 30) {
    throw new CvAnalysisError("invalidDataShape");
  }

  for (const point of [...fractions.forward, ...fractions.reverse]) {
    if (!Number.isFinite(point.confidence) || point.confidence < 0) {
      throw new CvAnalysisError("invalidDataShape");
    }
    if (point.fraction !== null && (!Number.isFinite(point.fraction) || point.fraction < 0 || point.fraction > 1)) {
      throw new CvAnalysisError("invalidDataShape");
    }
  }

  return normalizePotentialGrid(potentials);
}

function normalizePotentialGrid(potentials: number[]): number[] {
  if (potentials.length === 0 || potentials.some((potential) => !Number.isFinite(potential))) {
    throw new CvAnalysisError("invalidDataShape");
  }
  if (potentials.length === 1) return [0];
  const minimum = potentials[0];
  const span = potentials[potentials.length - 1] - minimum;
  if (!Number.isFinite(span) || span <= 0) throw new CvAnalysisError("invalidDataShape");
  const normalized = potentials.map((potential) => (potential - minimum) / span);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] <= normalized[index - 1]) throw new CvAnalysisError("invalidDataShape");
  }
  return normalized;
}

function normalizedIndexGrid(length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  return Array.from({ length }, (_value, index) => index / (length - 1));
}

function validateValueLength(values: number[], normalizedPotentials: number[]) {
  if (values.length !== normalizedPotentials.length
    || values.some((value) => !Number.isFinite(value))) {
    throw new CvAnalysisError("invalidDataShape");
  }
}

function makeSecondDifferenceOperator(normalizedPotentials: number[]): SecondDifferenceOperator {
  if (normalizedPotentials.length < 3) return { rows: [], lipschitzBound: 0 };

  const rows: SecondDifferenceRow[] = [];
  const absoluteRowSums = new Array<number>(normalizedPotentials.length).fill(0);
  for (let index = 1; index < normalizedPotentials.length - 1; index += 1) {
    const leftSpacing = normalizedPotentials[index] - normalizedPotentials[index - 1];
    const rightSpacing = normalizedPotentials[index + 1] - normalizedPotentials[index];
    if (!Number.isFinite(leftSpacing)
      || !Number.isFinite(rightSpacing)
      || leftSpacing <= 0
      || rightSpacing <= 0) {
      throw new CvAnalysisError("invalidDataShape");
    }

    const quadratureWidth = (leftSpacing + rightSpacing) / 2;
    const scale = Math.sqrt(quadratureWidth);
    const coefficients: [number, number, number] = [
      scale * 2 / (leftSpacing * (leftSpacing + rightSpacing)),
      scale * -2 / (leftSpacing * rightSpacing),
      scale * 2 / (rightSpacing * (leftSpacing + rightSpacing))
    ];
    const indices: [number, number, number] = [index - 1, index, index + 1];
    rows.push({ indices, coefficients });

    for (let rowPosition = 0; rowPosition < indices.length; rowPosition += 1) {
      for (let columnPosition = 0; columnPosition < indices.length; columnPosition += 1) {
        absoluteRowSums[indices[rowPosition]] += Math.abs(
          coefficients[rowPosition] * coefficients[columnPosition]
        );
      }
    }
  }

  return {
    rows,
    lipschitzBound: 2 * Math.max(...absoluteRowSums)
  };
}

function applySecondDifferenceRow(values: number[], row: SecondDifferenceRow): number {
  return row.coefficients[0] * values[row.indices[0]]
    + row.coefficients[1] * values[row.indices[1]]
    + row.coefficients[2] * values[row.indices[2]];
}

function combineBranchTargets(fractions: DunnFractionGrid): { target: number[]; weight: number[] } {
  const target: number[] = [];
  const weight: number[] = [];

  for (let index = 0; index < fractions.forward.length; index += 1) {
    let weightedFraction = 0;
    let totalWeight = 0;
    for (const point of [fractions.forward[index], fractions.reverse[index]]) {
      const contribution = branchContribution(point);
      if (!contribution) continue;
      weightedFraction += contribution.weight * contribution.fraction;
      totalWeight += contribution.weight;
    }
    weight.push(totalWeight);
    target.push(totalWeight > 0 ? weightedFraction / totalWeight : Number.NaN);
  }

  return { target, weight };
}

function branchContribution(point: DunnFractionPoint): { fraction: number; weight: number } | null {
  if (point.fraction === null || point.confidence <= 0) return null;
  return {
    fraction: point.fraction,
    weight: point.confidence
  };
}

function initializeMissingTargets(target: number[], weight: number[]): number[] {
  const initialized = target.map((value, index) => weight[index] > 0 ? value : Number.NaN);
  const anchorIndices = initialized
    .map((value, index) => Number.isFinite(value) ? index : -1)
    .filter((index) => index >= 0);

  if (anchorIndices.length === 0) return initialized.map(() => 0.5);
  if (anchorIndices.length === 1) return initialized.map(() => initialized[anchorIndices[0]]);

  let previousAnchor = anchorIndices[0];
  for (let index = 0; index <= previousAnchor; index += 1) {
    initialized[index] = initialized[previousAnchor];
  }

  for (const nextAnchor of anchorIndices.slice(1)) {
    const startValue = initialized[previousAnchor];
    const endValue = initialized[nextAnchor];
    const width = nextAnchor - previousAnchor;
    for (let index = previousAnchor + 1; index < nextAnchor; index += 1) {
      const fraction = (index - previousAnchor) / width;
      initialized[index] = startValue + fraction * (endValue - startValue);
    }
    previousAnchor = nextAnchor;
  }

  for (let index = previousAnchor; index < initialized.length; index += 1) {
    initialized[index] = initialized[previousAnchor];
  }
  return initialized.map((value) => Math.min(1, Math.max(0, value)));
}

function solveProjected(
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator,
  tolerance: number,
  initial: number[]
): ProjectedSolution {
  const maxWeight = weight.reduce((max, value) => Math.max(max, value), 0);
  let localLipschitz = 2 * maxWeight + lambda * operator.lipschitzBound + Number.EPSILON;
  if (!Number.isFinite(localLipschitz) || localLipschitz <= 0) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  let g = initial.map((value) => Math.min(1, Math.max(0, value)));
  let accelerated = [...g];
  let momentum = 1;
  const gradient = new Array<number>(g.length).fill(0);
  const next = new Array<number>(g.length).fill(0);
  let previousObjective = objective(g, target, weight, lambda, operator);
  if (!Number.isFinite(previousObjective)) throw new CvAnalysisError("reconstructionFailed");

  let residual = optimalityResidual(g, target, weight, lambda, operator);
  if (residual <= tolerance) {
    return { g, iterations: 0, converged: true, optimalityResidual: residual };
  }

  for (let iterations = 1; iterations <= MAX_ITERATIONS; iterations += 1) {
    gradient.fill(0);
    addFidelityGradient(accelerated, target, weight, gradient);
    addRoughnessGradient(accelerated, lambda, operator, gradient);

    projectGradientStep(accelerated, gradient, 1 / localLipschitz, next);
    while (!majorizesObjective(
      next,
      accelerated,
      gradient,
      localLipschitz,
      target,
      weight,
      lambda,
      operator
    )) {
      localLipschitz *= 2;
      if (!Number.isFinite(localLipschitz)) throw new CvAnalysisError("reconstructionFailed");
      projectGradientStep(accelerated, gradient, 1 / localLipschitz, next);
    }

    const nextObjective = objective(next, target, weight, lambda, operator);
    if (!Number.isFinite(nextObjective)) throw new CvAnalysisError("reconstructionFailed");
    if (nextObjective > previousObjective) {
      accelerated = [...g];
      momentum = 1;
      continue;
    }

    const previousMomentum = momentum;
    const restart = dotDifference(next, g, accelerated, next) > 0;
    momentum = restart ? 1 : (1 + Math.sqrt(1 + 4 * momentum * momentum)) / 2;
    const extrapolation = restart ? 0 : (previousMomentum - 1) / momentum;
    accelerated = next.map((value, index) => value + extrapolation * (value - g[index]));
    g = [...next];
    previousObjective = nextObjective;

    if (iterations % 10 === 0) {
      residual = optimalityResidual(g, target, weight, lambda, operator);
      if (residual <= tolerance) {
        return { g, iterations, converged: true, optimalityResidual: residual };
      }
    }
  }

  throw new CvAnalysisError("reconstructionFailed");
}

function projectGradientStep(
  accelerated: number[],
  gradient: number[],
  step: number,
  next: number[]
) {
  for (let index = 0; index < accelerated.length; index += 1) {
    next[index] = Math.min(1, Math.max(0, accelerated[index] - step * gradient[index]));
  }
}

function majorizesObjective(
  next: number[],
  accelerated: number[],
  gradient: number[],
  localLipschitz: number,
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator
): boolean {
  let gradientTerm = 0;
  let squaredDistance = 0;
  for (let index = 0; index < next.length; index += 1) {
    const difference = next[index] - accelerated[index];
    gradientTerm += gradient[index] * difference;
    squaredDistance += difference * difference;
  }
  const nextObjective = objective(next, target, weight, lambda, operator);
  const quadraticBound = objective(accelerated, target, weight, lambda, operator)
    + gradientTerm
    + localLipschitz * squaredDistance / 2;
  const roundingTolerance = 1e-12 * Math.max(
    1,
    Math.abs(nextObjective),
    Math.abs(quadraticBound)
  );
  return Number.isFinite(nextObjective)
    && Number.isFinite(quadraticBound)
    && nextObjective <= quadraticBound + roundingTolerance;
}

function dotDifference(a: number[], b: number[], c: number[], d: number[]): number {
  let dotProduct = 0;
  for (let index = 0; index < a.length; index += 1) {
    dotProduct += (a[index] - b[index]) * (c[index] - d[index]);
  }
  return dotProduct;
}

function addFidelityGradient(
  g: number[],
  target: number[],
  weight: number[],
  gradient: number[]
) {
  for (let index = 0; index < g.length; index += 1) {
    gradient[index] += 2 * weight[index] * (g[index] - target[index]);
  }
}

function addRoughnessGradient(
  g: number[],
  lambda: number,
  operator: SecondDifferenceOperator,
  gradient: number[]
) {
  if (operator.rows.length === 0 || lambda === 0) return;

  for (const row of operator.rows) {
    const secondDifference = applySecondDifferenceRow(g, row);
    const scaled = 2 * lambda * secondDifference;
    for (let rowPosition = 0; rowPosition < row.indices.length; rowPosition += 1) {
      gradient[row.indices[rowPosition]] += scaled * row.coefficients[rowPosition];
    }
  }
}

function optimalityResidual(
  g: number[],
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator
): number {
  const gradient = new Array<number>(g.length).fill(0);
  addFidelityGradient(g, target, weight, gradient);
  addRoughnessGradient(g, lambda, operator, gradient);

  let residual = 0;
  for (let index = 0; index < g.length; index += 1) {
    const value = g[index];
    const component = gradient[index];
    const violation = value === 0
      ? Math.min(0, component)
      : value === 1
        ? Math.max(0, component)
        : component;
    residual = Math.max(residual, Math.abs(violation));
  }
  return residual;
}

function makeDiagnostics(
  g: number[],
  target: number[],
  weight: number[],
  baseLambda: number,
  lambda: number,
  smoothingMultiplier: number,
  operator: SecondDifferenceOperator,
  iterations: number,
  converged: boolean
): DunnRegularizationDiagnostics {
  const fidelity = fidelityLoss(g, target, weight);
  const roughness = operatorRoughness(g, operator);
  return {
    baseLambda,
    lambda,
    smoothingMultiplier,
    iterations,
    converged,
    optimalityResidual: optimalityResidual(g, target, weight, lambda, operator),
    fidelity,
    roughness
  };
}

function fidelityLoss(g: number[], target: number[], weight: number[]) {
  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  return fidelity;
}

function selectLCurveIndex(
  candidates: Array<{ meanFidelity: number; meanRoughness: number }>
): number {
  if (candidates.length < 3) return Math.floor(candidates.length / 2);

  let selectedIndex = Math.floor(candidates.length / 2);
  let bestCurvature = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < candidates.length - 1; index += 1) {
    const curvature = discreteCurvature(
      logPoint(candidates[index - 1]),
      logPoint(candidates[index]),
      logPoint(candidates[index + 1])
    );
    if (Number.isFinite(curvature) && curvature > bestCurvature) {
      bestCurvature = curvature;
      selectedIndex = index;
    }
  }
  return selectedIndex;
}

function logPoint(candidate: { meanFidelity: number; meanRoughness: number }): [number, number] {
  return [
    Math.log10(Math.max(candidate.meanFidelity, Number.EPSILON)),
    Math.log10(Math.max(candidate.meanRoughness, Number.EPSILON))
  ];
}

function discreteCurvature(a: [number, number], b: [number, number], c: [number, number]) {
  const ab = distance(a, b);
  const bc = distance(b, c);
  const ca = distance(c, a);
  const doubleArea = Math.abs(
    (b[0] - a[0]) * (c[1] - a[1])
    - (b[1] - a[1]) * (c[0] - a[0])
  );
  const denominator = ab * bc * ca;
  if (denominator === 0) return 0;
  return 2 * doubleArea / denominator;
}

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
