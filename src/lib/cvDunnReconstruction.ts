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

const LAMBDA_CANDIDATES = [1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100] as const;
const MAX_ITERATIONS = 10_000;
const CONVERGENCE_TOLERANCE = 1e-9;

interface SecondDifferenceRow {
  indices: [number, number, number];
  coefficients: [number, number, number];
}

interface SecondDifferenceOperator {
  rows: SecondDifferenceRow[];
  lipschitzBound: number;
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
  potentials: number[]
): DunnSharedFractionResult {
  const normalizedPotentials = validateInputs(fractions, potentials);
  const operator = makeSecondDifferenceOperator(normalizedPotentials);
  const combined = combineBranchTargets(fractions);
  const initializedTarget = initializeMissingTargets(combined.target, combined.weight);
  const candidates = LAMBDA_CANDIDATES.map((lambda) => {
    const solution = solveProjected(initializedTarget, combined.weight, lambda, operator);
    return {
      lambda,
      solution,
      meanFidelity: normalizedFidelity(solution.g, initializedTarget, combined.weight),
      meanRoughness: normalizedRoughness(solution.g, operator)
    };
  }).filter((candidate) => (
    Number.isFinite(candidate.meanFidelity)
    && Number.isFinite(candidate.meanRoughness)
    && candidate.meanFidelity >= 0
    && candidate.meanRoughness >= 0
  ));

  if (candidates.length === 0) throw new CvAnalysisError("reconstructionFailed");
  const selected = candidates[selectLCurveIndex(candidates)];
  return {
    g: selected.solution.g,
    diagnostics: selected.solution.diagnostics
  };
}

function objective(
  g: number[],
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator
) {
  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  return fidelity + lambda * operatorRoughness(g, operator);
}

function validateInputs(fractions: DunnFractionGrid, potentials: number[]): number[] {
  const pointCount = potentials.length;
  if (pointCount === 0
    || fractions.forward.length !== pointCount
    || fractions.reverse.length !== pointCount
    || potentials.some((potential) => !Number.isFinite(potential))) {
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

    const coefficients: [number, number, number] = [
      2 / (leftSpacing * (leftSpacing + rightSpacing)),
      -2 / (leftSpacing * rightSpacing),
      2 / (rightSpacing * (leftSpacing + rightSpacing))
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
  operator: SecondDifferenceOperator
): DunnSharedFractionResult {
  const maxWeight = weight.reduce((max, value) => Math.max(max, value), 0);
  const step = 1 / (2 * maxWeight + lambda * operator.lipschitzBound + Number.EPSILON);
  const g = target.map((value) => Math.min(1, Math.max(0, value)));
  const gradient = new Array<number>(g.length).fill(0);
  let converged = false;
  let iterations = 0;

  for (iterations = 1; iterations <= MAX_ITERATIONS; iterations += 1) {
    gradient.fill(0);
    addFidelityGradient(g, target, weight, gradient);
    addRoughnessGradient(g, lambda, operator, gradient);

    let maxUpdate = 0;
    for (let index = 0; index < g.length; index += 1) {
      const next = Math.min(1, Math.max(0, g[index] - step * gradient[index]));
      const update = Math.abs(next - g[index]);
      if (update > maxUpdate) maxUpdate = update;
      g[index] = next;
    }

    const currentObjective = objective(g, target, weight, lambda, operator);
    if (!Number.isFinite(currentObjective)) throw new CvAnalysisError("reconstructionFailed");
    if (maxUpdate < CONVERGENCE_TOLERANCE) {
      converged = true;
      break;
    }
  }

  if (!converged) throw new CvAnalysisError("reconstructionFailed");
  const diagnostics = makeDiagnostics(g, target, weight, lambda, operator, iterations, converged);
  return { g, diagnostics };
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

function makeDiagnostics(
  g: number[],
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator,
  iterations: number,
  converged: boolean
): DunnRegularizationDiagnostics {
  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  const roughness = operatorRoughness(g, operator);
  return {
    lambda,
    iterations,
    converged,
    fidelity,
    roughness
  };
}

function normalizedFidelity(g: number[], target: number[], weight: number[]) {
  const totalWeight = weight.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return 0;

  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  return fidelity / totalWeight;
}

function normalizedRoughness(g: number[], operator: SecondDifferenceOperator) {
  return operatorRoughness(g, operator) / Math.max(1, operator.rows.length);
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
