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

export function secondDifferenceRoughness(values: number[]): number {
  if (values.length < 3) return 0;

  let roughness = 0;
  for (let index = 1; index < values.length - 1; index += 1) {
    const secondDifference = values[index - 1] - 2 * values[index] + values[index + 1];
    roughness += secondDifference * secondDifference;
  }
  return roughness;
}

export function optimizeSharedFraction(
  fractions: DunnFractionGrid,
  potentials: number[]
): DunnSharedFractionResult {
  const normalizedPotentials = validateInputs(fractions, potentials);
  const combined = combineBranchTargets(fractions);
  const initializedTarget = initializeMissingTargets(combined.target, combined.weight);
  const candidates = LAMBDA_CANDIDATES.map((lambda) => {
    const solution = solveProjected(initializedTarget, combined.weight, lambda);
    return {
      lambda,
      solution,
      meanFidelity: normalizedFidelity(solution.g, initializedTarget, combined.weight),
      meanRoughness: normalizedRoughness(solution.g, normalizedPotentials)
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

function objective(g: number[], target: number[], weight: number[], lambda: number) {
  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  return fidelity + lambda * secondDifferenceRoughness(g);
}

function validateInputs(fractions: DunnFractionGrid, potentials: number[]): number[] {
  const pointCount = potentials.length;
  if (pointCount === 0
    || fractions.forward.length !== pointCount
    || fractions.reverse.length !== pointCount
    || potentials.some((potential) => !Number.isFinite(potential))) {
    throw new CvAnalysisError("invalidDataShape");
  }

  if (pointCount > 1) {
    const step = potentials[1] - potentials[0];
    const tolerance = Math.max(Number.EPSILON * Math.max(1, Math.abs(potentials.at(-1)! - potentials[0])) * 64, Math.abs(step) * 1e-9);
    if (!Number.isFinite(step) || step <= 0) throw new CvAnalysisError("invalidDataShape");
    for (let index = 1; index < pointCount; index += 1) {
      if (potentials[index] <= potentials[index - 1]) throw new CvAnalysisError("invalidDataShape");
      if (Math.abs((potentials[index] - potentials[index - 1]) - step) > tolerance) {
        throw new CvAnalysisError("invalidDataShape");
      }
    }
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
  if (potentials.length === 1) return [0];
  const minimum = potentials[0];
  const span = potentials[potentials.length - 1] - minimum;
  if (!Number.isFinite(span) || span <= 0) throw new CvAnalysisError("invalidDataShape");
  return potentials.map((potential) => (potential - minimum) / span);
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
  lambda: number
): DunnSharedFractionResult {
  const maxWeight = weight.reduce((max, value) => Math.max(max, value), 0);
  const step = 1 / (2 * maxWeight + 32 * lambda + Number.EPSILON);
  const g = target.map((value) => Math.min(1, Math.max(0, value)));
  const gradient = new Array<number>(g.length).fill(0);
  let converged = false;
  let iterations = 0;

  for (iterations = 1; iterations <= MAX_ITERATIONS; iterations += 1) {
    gradient.fill(0);
    addFidelityGradient(g, target, weight, gradient);
    addRoughnessGradient(g, lambda, gradient);

    let maxUpdate = 0;
    for (let index = 0; index < g.length; index += 1) {
      const next = Math.min(1, Math.max(0, g[index] - step * gradient[index]));
      const update = Math.abs(next - g[index]);
      if (update > maxUpdate) maxUpdate = update;
      g[index] = next;
    }

    const currentObjective = objective(g, target, weight, lambda);
    if (!Number.isFinite(currentObjective)) throw new CvAnalysisError("reconstructionFailed");
    if (maxUpdate < CONVERGENCE_TOLERANCE) {
      converged = true;
      break;
    }
  }

  if (!converged) throw new CvAnalysisError("reconstructionFailed");
  const diagnostics = makeDiagnostics(g, target, weight, lambda, iterations, converged);
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

function addRoughnessGradient(g: number[], lambda: number, gradient: number[]) {
  if (g.length < 3 || lambda === 0) return;

  for (let index = 1; index < g.length - 1; index += 1) {
    const secondDifference = g[index - 1] - 2 * g[index] + g[index + 1];
    const scaled = 2 * lambda * secondDifference;
    gradient[index - 1] += scaled;
    gradient[index] -= 2 * scaled;
    gradient[index + 1] += scaled;
  }
}

function makeDiagnostics(
  g: number[],
  target: number[],
  weight: number[],
  lambda: number,
  iterations: number,
  converged: boolean
): DunnRegularizationDiagnostics {
  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  const roughness = secondDifferenceRoughness(g);
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

function normalizedRoughness(g: number[], normalizedPotentials: number[]) {
  if (g.length < 3) return 0;
  const step = normalizedPotentials[1] - normalizedPotentials[0];
  return secondDifferenceRoughness(g) / Math.max(step * step, Number.EPSILON) / Math.max(1, g.length - 2);
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
