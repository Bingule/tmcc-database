import {
  CvAnalysisError,
  type DunnFractionGrid,
  type DunnFractionPoint,
  type DunnRegularizationDiagnostics,
  type DunnSharedFractionResult,
  type DunnSoftEnvelopeResult
} from "./cvTypes";
import { pchipInterpolate } from "./cvInterpolation";

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
const SOFT_ENVELOPE_FIDELITY_WEIGHT = 1;
const SOFT_ENVELOPE_ENDPOINT_FIDELITY_WEIGHT = 0.25;
const SOFT_ENVELOPE_SMOOTHNESS_RATIO = 1e-4;
const SOFT_ENVELOPE_LAMBDA = 8;
const SOFT_ENVELOPE_TOLERANCE_SCALE = 1e-10;
const ENDPOINT_SHAPE_WINDOW = 0.15;
const ENDPOINT_DIRECTION_TOLERANCE_SCALE = 1e-10;
const ENDPOINT_DIRECTION_MIN_DELTA = 1e-8;
const ENDPOINT_PROJECTION_TOLERANCE = 1e-10;
const SOFT_ENVELOPE_MAXIMUM_ACTIVE_SET_ITERATIONS = 50;
const SOFT_ENVELOPE_MAXIMUM_SUPPORT_POINTS = 1_001;

export interface DunnSoftEnvelopeInput {
  baselineG: number[];
  potentials: number[];
  forwardCurrents: number[];
  reverseCurrents: number[];
  baselineLambda: number;
}

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
  let warmStart = weightedAffineInitial(
    initializedTarget,
    normalizedWeight,
    normalizedPotentials
  );

  for (const baseLambda of [...BASE_LAMBDA_CANDIDATES].reverse()) {
    try {
      const directInitial = solveUnconstrainedBanded(
        initializedTarget,
        normalizedWeight,
        baseLambda,
        operator
      );
      const candidateInitial = directInitial
        && objective(directInitial, initializedTarget, normalizedWeight, baseLambda, operator)
          < objective(warmStart, initializedTarget, normalizedWeight, baseLambda, operator)
        ? directInitial
        : warmStart;
      const solution = solveProjected(
        initializedTarget,
        normalizedWeight,
        baseLambda,
        operator,
        CANDIDATE_OPTIMALITY_TOLERANCE,
        candidateInitial,
        MAX_ITERATIONS
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

  if (candidates.length !== BASE_LAMBDA_CANDIDATES.length) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  candidates.sort((left, right) => left.baseLambda - right.baseLambda);
  const selected = candidates[selectLCurveIndex(candidates)];
  const lambda = selected.baseLambda * smoothingMultiplier;
  const directFinalInitial = solveUnconstrainedBanded(
    initializedTarget,
    normalizedWeight,
    lambda,
    operator
  );
  const finalInitial = directFinalInitial
    && objective(directFinalInitial, initializedTarget, normalizedWeight, lambda, operator)
      < objective(selected.solution.g, initializedTarget, normalizedWeight, lambda, operator)
    ? directFinalInitial
    : selected.solution.g;
  const solution = solveProjected(
    initializedTarget,
    normalizedWeight,
    lambda,
    operator,
    OPTIMALITY_TOLERANCE,
    finalInitial,
    MAX_ITERATIONS
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

export function envelopePenalty(
  current: number,
  lower: number,
  upper: number,
  tolerance: number
): number {
  if (![current, lower, upper, tolerance].every(Number.isFinite)
    || lower > upper
    || tolerance < 0) {
    throw new CvAnalysisError("invalidDataShape");
  }
  const upperViolation = Math.max(0, current - upper - tolerance);
  const lowerViolation = Math.max(0, lower - current - tolerance);
  return upperViolation * upperViolation + lowerViolation * lowerViolation;
}

export function preserveOptimizedSharedFraction(
  baselineG: number[],
  potentials: number[]
): DunnSoftEnvelopeResult {
  const roughness = secondDifferenceRoughness(baselineG, potentials);
  if (baselineG.some((fraction) =>
    !Number.isFinite(fraction) || fraction < 0 || fraction > 1)) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  return {
    baselineG: [...baselineG],
    g: [...baselineG],
    diagnostics: {
      fidelityWeight: 1,
      smoothnessLambda: 0,
      envelopeLambda: 0,
      envelopeTolerance: 0,
      iterations: 0,
      converged: true,
      optimalityResidual: 0,
      fidelity: 0,
      roughness,
      envelopePenalty: 0,
      maximumSharedFractionAdjustment: 0
    }
  };
}

export function refineSharedFractionWithSoftEnvelope(
  input: DunnSoftEnvelopeInput
): DunnSoftEnvelopeResult {
  const normalizedPotentials = validateSoftEnvelopeInput(input);
  const operator = makeSecondDifferenceOperator(normalizedPotentials);
  const currentScale = Math.max(
    1,
    ...input.forwardCurrents.map(Math.abs),
    ...input.reverseCurrents.map(Math.abs)
  );
  const forward = input.forwardCurrents.map((current) => current / currentScale);
  const reverse = input.reverseCurrents.map((current) => current / currentScale);
  const normalizedTolerance = SOFT_ENVELOPE_TOLERANCE_SCALE;
  const smoothnessLambda = Math.max(
    1e-10,
    SOFT_ENVELOPE_SMOOTHNESS_RATIO * input.baselineLambda
  );
  const hasNumericalEnvelopeViolation = hasEnvelopeViolation(
    input.baselineG,
    forward,
    reverse,
    normalizedTolerance
  );
  if (!hasNumericalEnvelopeViolation) {
    const g = input.baselineG.map((value) => Math.min(1, Math.max(0, value)));
    return {
      baselineG: [...input.baselineG],
      g,
      diagnostics: makeSoftEnvelopeDiagnostics(
        g,
        input.baselineG,
        forward,
        reverse,
        normalizedTolerance,
        currentScale,
        smoothnessLambda,
        operator,
        0,
        0
      )
    };
  }
  if (input.baselineG.length > SOFT_ENVELOPE_MAXIMUM_SUPPORT_POINTS) {
    const supportIndices = selectSoftEnvelopeSupportIndices(
      input.baselineG,
      forward,
      reverse,
      normalizedTolerance,
      SOFT_ENVELOPE_MAXIMUM_SUPPORT_POINTS
    );
    const support = refineSharedFractionWithSoftEnvelope({
      baselineG: supportIndices.map((index) => input.baselineG[index]!),
      potentials: supportIndices.map((index) => input.potentials[index]!),
      forwardCurrents: supportIndices.map((index) => input.forwardCurrents[index]!),
      reverseCurrents: supportIndices.map((index) => input.reverseCurrents[index]!),
      baselineLambda: input.baselineLambda
    });
    const supportPotentials = supportIndices.map((index) => input.potentials[index]!);
    const interpolated = pchipInterpolate(supportPotentials, support.g, input.potentials)
      .map((value) => Math.min(1, Math.max(0, value)));
    const g = refineEndpointMorphology(
      interpolated,
      normalizedPotentials,
      forward,
      reverse,
      normalizedTolerance
    );
    return {
      baselineG: [...input.baselineG],
      g,
      diagnostics: makeSoftEnvelopeDiagnostics(
        g,
        input.baselineG,
        forward,
        reverse,
        normalizedTolerance,
        currentScale,
        smoothnessLambda,
        operator,
        support.diagnostics.iterations,
        support.diagnostics.optimalityResidual
      )
    };
  }
  let g = [...input.baselineG];
  let totalIterations = 0;

  for (let activeSetIteration = 1;
    activeSetIteration <= SOFT_ENVELOPE_MAXIMUM_ACTIVE_SET_ITERATIONS;
    activeSetIteration += 1) {
    const model = makeSoftEnvelopeQuadraticModel(
      g,
      input.baselineG,
      forward,
      reverse,
      normalizedTolerance
    );
    const direct = solveUnconstrainedBanded(
      model.target,
      model.weight,
      smoothnessLambda,
      operator
    );
    const initial = direct ?? g;
    const solution = solveProjected(
      model.target,
      model.weight,
      smoothnessLambda,
      operator,
      OPTIMALITY_TOLERANCE,
      initial,
      MAX_ITERATIONS
    );
    totalIterations += solution.iterations;
    g = solution.g;
    const residual = softEnvelopeOptimalityResidual(
      g,
      input.baselineG,
      forward,
      reverse,
      normalizedTolerance,
      smoothnessLambda,
      operator
    );
    if (residual <= OPTIMALITY_TOLERANCE) {
      const refined = refineEndpointMorphology(
        g,
        normalizedPotentials,
        forward,
        reverse,
        normalizedTolerance
      );
      const diagnostics = makeSoftEnvelopeDiagnostics(
        refined,
        input.baselineG,
        forward,
        reverse,
        normalizedTolerance,
        currentScale,
        smoothnessLambda,
        operator,
        totalIterations,
        residual
      );
      return { baselineG: [...input.baselineG], g: refined, diagnostics };
    }
  }

  throw new CvAnalysisError("reconstructionFailed");
}

function refineEndpointMorphology(
  incomingG: number[],
  normalizedPotentials: number[],
  forward: number[],
  reverse: number[],
  tolerance: number
): number[] {
  if (incomingG.length === 1) {
    const [lower, upper] = feasibleFractionInterval(forward[0]!, reverse[0]!);
    return [Math.min(1, Math.max(0, Math.min(upper, Math.max(lower, incomingG[0]!))))];
  }

  const reconnected = reconnectSharedFractionEndpoints(
    incomingG,
    forward,
    reverse,
    tolerance
  );
  const refined = reconnected.map((value) => Math.min(1, Math.max(0, value)));

  for (const endpointIndex of [0, refined.length - 1]) {
    const [lower, upper] = feasibleFractionInterval(
      forward[endpointIndex]!,
      reverse[endpointIndex]!
    );
    refined[endpointIndex] = Math.min(
      upper,
      Math.max(lower, refined[endpointIndex]!)
    );
  }

  const shouldFixLeftEndpoint = isEndpointWindowMonotone(
    forward,
    normalizedPotentials,
    "left"
  );
  const shouldFixRightEndpoint = isEndpointWindowMonotone(
    forward,
    normalizedPotentials,
    "right"
  );
  if (hasAddedEndpointDirectionReversal(
    refined,
    normalizedPotentials,
    forward,
    reverse,
    tolerance
  ) && (shouldFixLeftEndpoint || shouldFixRightEndpoint)) {
    try {
      enforceEndpointDirectionsSequentially(
        refined,
        normalizedPotentials,
        forward,
        reverse,
        tolerance,
        shouldFixLeftEndpoint,
        shouldFixRightEndpoint
      );
      validateEndpointMorphology(
        refined,
        normalizedPotentials,
        forward,
        reverse,
        tolerance
      );
      return refined;
    } catch (error) {
      if (error instanceof CvAnalysisError && error.code === "reconstructionFailed") {
        return reconnected.map((value) => Math.min(1, Math.max(0, value)));
      }
      throw error;
    }
  }
  validateEndpointFeasible(refined, forward, reverse);
  return refined;
}

function isEndpointWindowMonotone(
  raw: number[],
  normalizedPotentials: number[],
  side: "left" | "right"
): boolean {
  let previousSign = 0;
  const endpointIndex = side === "left" ? 0 : raw.length - 2;
  for (let index = 0; index < raw.length - 1; index += 1) {
    const inWindow = side === "left"
      ? normalizedPotentials[index + 1]! <= ENDPOINT_SHAPE_WINDOW + Number.EPSILON
      : normalizedPotentials[index]! >= 1 - ENDPOINT_SHAPE_WINDOW - Number.EPSILON;
    if (!inWindow || index === endpointIndex) continue;

    const delta = raw[index + 1]! - raw[index]!;
    if (Math.abs(delta) < ENDPOINT_DIRECTION_MIN_DELTA) continue;
    const sign = Math.sign(delta);
    if (previousSign === 0) {
      previousSign = sign;
      continue;
    }
    if (sign !== previousSign) return false;
    previousSign = sign;
  }
  return true;
}

function reconnectSharedFractionEndpoints(
  g: number[],
  forward: number[],
  reverse: number[],
  tolerance: number
): number[] {
  const reconnected = [...g];
  const lastIndex = g.length - 1;
  const windowLength = Math.max(2, Math.floor(ENDPOINT_SHAPE_WINDOW * (g.length - 1)) + 1);
  const endpoints = [
    0,
    lastIndex
  ] as const;

  for (const index of endpoints) {
    const [pointLower, pointUpper] = feasibleFractionInterval(
      forward[index]!,
      reverse[index]!
    );
    const lower = Math.min(forward[index]!, reverse[index]!);
    const upper = Math.max(forward[index]!, reverse[index]!);
    const fraction = g[index]!;
    const forwardCurrent = fraction * forward[index]!;
    const reverseCurrent = fraction * reverse[index]!;
    const isContained = forwardCurrent >= lower - tolerance
      && forwardCurrent <= upper + tolerance
      && reverseCurrent >= lower - tolerance
      && reverseCurrent <= upper + tolerance;
    if (isContained) continue;
    const constrainedEndpoint = Math.min(pointUpper, Math.max(pointLower, fraction));
    const direction = index === 0 ? "forward" : "reverse";
    const anchorIndex = direction === "forward"
      ? windowLength - 1
      : g.length - windowLength;
    const affectedWindow = direction === "forward"
      ? Array.from({ length: anchorIndex + 1 }, (_, i) => i)
      : Array.from({ length: g.length - anchorIndex }, (_, i) => anchorIndex + i);
    for (const pointIndex of affectedWindow) {
      if (pointIndex < 0 || pointIndex >= g.length) continue;
      const endpointProgress = direction === "forward"
        ? pointIndex / (windowLength - 1)
        : (g.length - 1 - pointIndex) / (windowLength - 1);
      const recoveryWeight = smoothstep(Math.min(1, endpointProgress));
      reconnected[pointIndex] = Math.min(1, Math.max(0,
        lerp(constrainedEndpoint, g[pointIndex]!, recoveryWeight)
      ));
    }
  }
  return reconnected;
}

function lerp(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

function smoothstep(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function hasAddedEndpointDirectionReversal(
  g: number[],
  normalizedPotentials: number[],
  forward: number[],
  reverse: number[],
  normalizedTolerance: number
): boolean {
  let reversalCount = 0;
  for (let index = 0; index < g.length - 1; index += 1) {
    const inEndpointWindow = normalizedPotentials[index + 1]! <= ENDPOINT_SHAPE_WINDOW
      || normalizedPotentials[index]! >= 1 - ENDPOINT_SHAPE_WINDOW;
    if (!inEndpointWindow) continue;
    for (const raw of [forward, reverse]) {
      const rawLeft = raw[index]!;
      const rawRight = raw[index + 1]!;
      const scale = Math.max(1, Math.abs(rawLeft), Math.abs(rawRight));
      const directionTolerance = Math.max(
        normalizedTolerance,
        ENDPOINT_DIRECTION_TOLERANCE_SCALE * scale
      );
      const rawDelta = rawRight - rawLeft;
      if (Math.abs(rawDelta) < ENDPOINT_DIRECTION_MIN_DELTA) {
        continue;
      }
      const capacitiveDelta = g[index + 1]! * rawRight - g[index]! * rawLeft;
      if (Math.abs(rawDelta) > directionTolerance
        && Math.abs(capacitiveDelta) > directionTolerance
        && rawDelta * capacitiveDelta < 0) {
        reversalCount += 1;
      }
    }
  }
  return reversalCount >= 1;
}

function enforceEndpointDirectionsSequentially(
  g: number[],
  normalizedPotentials: number[],
  forward: number[],
  reverse: number[],
  normalizedTolerance: number,
  adjustLeftEndpoint: boolean,
  adjustRightEndpoint: boolean
) {
  if (adjustLeftEndpoint) {
    for (let rightIndex = 1;
      rightIndex < g.length
        && normalizedPotentials[rightIndex]! <= ENDPOINT_SHAPE_WINDOW + Number.EPSILON;
      rightIndex += 1) {
      g[rightIndex] = closestFeasibleNeighborFraction(
        g[rightIndex]!,
        g[rightIndex - 1]!,
        forward[rightIndex - 1]!,
        forward[rightIndex]!,
        reverse[rightIndex - 1]!,
        reverse[rightIndex]!,
        "right",
        normalizedTolerance
      );
    }
  }

  if (adjustRightEndpoint) {
    for (let leftIndex = g.length - 2;
      leftIndex >= 0
        && normalizedPotentials[leftIndex]! >= 1 - ENDPOINT_SHAPE_WINDOW - Number.EPSILON;
      leftIndex -= 1) {
      g[leftIndex] = closestFeasibleNeighborFraction(
        g[leftIndex]!,
        g[leftIndex + 1]!,
        forward[leftIndex]!,
        forward[leftIndex + 1]!,
        reverse[leftIndex]!,
        reverse[leftIndex + 1]!,
        "left",
        normalizedTolerance
      );
    }
  }
}

function closestFeasibleNeighborFraction(
  preferred: number,
  fixedFraction: number,
  forwardLeft: number,
  forwardRight: number,
  reverseLeft: number,
  reverseRight: number,
  variableSide: "left" | "right",
  normalizedTolerance: number
): number {
  let lower = 0;
  let upper = 1;
  for (const [rawLeft, rawRight] of [
    [forwardLeft, forwardRight],
    [reverseLeft, reverseRight]
  ] as const) {
    const rawDelta = rawRight - rawLeft;
    if (Math.abs(rawDelta) < ENDPOINT_DIRECTION_MIN_DELTA) {
      continue;
    }
    const scale = Math.max(1, Math.abs(rawLeft), Math.abs(rawRight));
    const directionTolerance = Math.max(
      normalizedTolerance,
      ENDPOINT_DIRECTION_TOLERANCE_SCALE * scale
    );
    if (Math.abs(rawDelta) <= directionTolerance) continue;
    const direction = Math.sign(rawDelta);
    const coefficient = variableSide === "right"
      ? direction * rawRight
      : -direction * rawLeft;
    const fixedTerm = variableSide === "right"
      ? -direction * fixedFraction * rawLeft
      : direction * fixedFraction * rawRight;
    if (Math.abs(coefficient) <= Number.EPSILON) {
      if (fixedTerm < -directionTolerance) {
        throw new CvAnalysisError("reconstructionFailed");
      }
      continue;
    }
    const boundary = -fixedTerm / coefficient;
    if (coefficient > 0) lower = Math.max(lower, boundary);
    else upper = Math.min(upper, boundary);
  }
  if (lower > upper + ENDPOINT_PROJECTION_TOLERANCE) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  return Math.min(upper, Math.max(lower, preferred));
}

function feasibleFractionInterval(forward: number, reverse: number): [number, number] {
  const lowerCurrent = Math.min(forward, reverse);
  const upperCurrent = Math.max(forward, reverse);
  let lowerFraction = 0;
  let upperFraction = 1;
  for (const raw of [forward, reverse]) {
    if (Math.abs(raw) <= Number.EPSILON) {
      if (lowerCurrent > 0 || upperCurrent < 0) {
        throw new CvAnalysisError("reconstructionFailed");
      }
      continue;
    }
    const first = lowerCurrent / raw;
    const second = upperCurrent / raw;
    lowerFraction = Math.max(lowerFraction, Math.min(first, second));
    upperFraction = Math.min(upperFraction, Math.max(first, second));
  }
  lowerFraction = Math.max(0, lowerFraction);
  upperFraction = Math.min(1, upperFraction);
  if (lowerFraction > upperFraction + ENDPOINT_PROJECTION_TOLERANCE) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  return [lowerFraction, upperFraction];
}

function validateEndpointMorphology(
  g: number[],
  normalizedPotentials: number[],
  forward: number[],
  reverse: number[],
  normalizedTolerance: number
) {
  if (g.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  for (const endpointIndex of [0, g.length - 1]) {
    const [lower, upper] = feasibleFractionInterval(
      forward[endpointIndex]!,
      reverse[endpointIndex]!
    );
    if (g[endpointIndex]! < lower - ENDPOINT_PROJECTION_TOLERANCE
      || g[endpointIndex]! > upper + ENDPOINT_PROJECTION_TOLERANCE) {
      throw new CvAnalysisError("reconstructionFailed");
    }
  }

  for (let index = 0; index < g.length - 1; index += 1) {
    const inEndpointWindow = normalizedPotentials[index + 1]! <= ENDPOINT_SHAPE_WINDOW + Number.EPSILON
      || normalizedPotentials[index]! >= 1 - ENDPOINT_SHAPE_WINDOW - Number.EPSILON;
    if (!inEndpointWindow) continue;
    for (const raw of [forward, reverse]) {
      const rawLeft = raw[index]!;
      const rawRight = raw[index + 1]!;
      const rawDelta = rawRight - rawLeft;
      if (Math.abs(rawDelta) < ENDPOINT_DIRECTION_MIN_DELTA) {
        continue;
      }
      const scale = Math.max(1, Math.abs(rawLeft), Math.abs(rawRight));
      const directionTolerance = Math.max(
        normalizedTolerance,
        ENDPOINT_DIRECTION_TOLERANCE_SCALE * scale
      );
      if (Math.abs(rawDelta) <= directionTolerance) continue;
      const capacitiveDelta = g[index + 1]! * rawRight - g[index]! * rawLeft;
      if (Math.sign(rawDelta) * capacitiveDelta < -2 * directionTolerance) {
        throw new CvAnalysisError("reconstructionFailed");
      }
    }
  }
}

function validateEndpointFeasible(g: number[], forward: number[], reverse: number[]) {
  for (const endpointIndex of [0, g.length - 1]) {
    const [lower, upper] = feasibleFractionInterval(
      forward[endpointIndex]!,
      reverse[endpointIndex]!
    );
    if (g[endpointIndex]! < lower - Number.EPSILON
      || g[endpointIndex]! > upper + Number.EPSILON) {
      throw new CvAnalysisError("reconstructionFailed");
    }
  }
}

function hasEnvelopeViolation(g: number[], forward: number[], reverse: number[], tolerance: number): boolean {
  for (let index = 0; index < g.length; index += 1) {
    const lower = Math.min(forward[index]!, reverse[index]!);
    const upper = Math.max(forward[index]!, reverse[index]!);
    const reconstructedForward = g[index]! * forward[index]!;
    const reconstructedReverse = g[index]! * reverse[index]!;
    if (reconstructedForward > upper + tolerance || reconstructedForward < lower - tolerance
      || reconstructedReverse > upper + tolerance || reconstructedReverse < lower - tolerance) {
      return true;
    }
  }
  return false;
}

function selectSoftEnvelopeSupportIndices(
  baselineG: number[],
  forward: number[],
  reverse: number[],
  tolerance: number,
  maximumPointCount: number
): number[] {
  const uniformCount = Math.ceil(maximumPointCount / 2);
  const indices = new Set<number>();
  for (let index = 0; index < uniformCount; index += 1) {
    indices.add(Math.round(index * (baselineG.length - 1) / (uniformCount - 1)));
  }
  const rankedViolations = baselineG
    .map((fraction, index) => {
      const lower = Math.min(forward[index]!, reverse[index]!);
      const upper = Math.max(forward[index]!, reverse[index]!);
      return {
        index,
        penalty: envelopePenalty(fraction * forward[index]!, lower, upper, tolerance)
          + envelopePenalty(fraction * reverse[index]!, lower, upper, tolerance)
      };
    })
    .filter((item) => item.index > 0 && item.index < baselineG.length - 1 && item.penalty > 0)
    .sort((left, right) => right.penalty - left.penalty || left.index - right.index);
  for (const item of rankedViolations) {
    if (indices.size >= maximumPointCount) break;
    indices.add(item.index);
  }
  return [...indices].sort((left, right) => left - right);
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

function validateSoftEnvelopeInput(input: DunnSoftEnvelopeInput): number[] {
  const pointCount = input.potentials.length;
  if (pointCount === 0
    || input.baselineG.length !== pointCount
    || input.forwardCurrents.length !== pointCount
    || input.reverseCurrents.length !== pointCount
    || !Number.isFinite(input.baselineLambda)
    || input.baselineLambda <= 0
    || input.baselineG.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || input.forwardCurrents.some((value) => !Number.isFinite(value))
    || input.reverseCurrents.some((value) => !Number.isFinite(value))) {
    throw new CvAnalysisError("invalidDataShape");
  }
  return normalizePotentialGrid(input.potentials);
}

function makeSoftEnvelopeQuadraticModel(
  g: number[],
  baselineG: number[],
  forward: number[],
  reverse: number[],
  tolerance: number
): { target: number[]; weight: number[] } {
  const pointWeight = SOFT_ENVELOPE_FIDELITY_WEIGHT / g.length;
  const envelopeWeightScale = SOFT_ENVELOPE_LAMBDA / g.length;
  const target: number[] = [];
  const weight: number[] = [];

  for (let index = 0; index < g.length; index += 1) {
    const endpointWeight = index === 0 || index === g.length - 1
      ? SOFT_ENVELOPE_ENDPOINT_FIDELITY_WEIGHT
      : 0;
    let totalWeight = pointWeight + endpointWeight;
    let weightedTarget = totalWeight * baselineG[index];
    const lower = Math.min(forward[index], reverse[index]);
    const upper = Math.max(forward[index], reverse[index]);

    // Exact reversal endpoints have zero integration measure. Keeping them on
    // the baseline avoids grid-density-dependent distortion at reconnection.
    const envelopeCurrents = index === 0 || index === g.length - 1
      ? []
      : [forward[index], reverse[index]];
    for (const raw of envelopeCurrents) {
      const reconstructed = g[index] * raw;
      let boundary: number | null = null;
      if (reconstructed > upper + tolerance) boundary = upper + tolerance;
      else if (reconstructed < lower - tolerance) boundary = lower - tolerance;
      if (boundary === null || Math.abs(raw) <= Number.EPSILON) continue;
      const localWeight = envelopeWeightScale * raw * raw;
      totalWeight += localWeight;
      weightedTarget += localWeight * boundary / raw;
    }

    weight.push(totalWeight);
    target.push(weightedTarget / totalWeight);
  }
  return { target, weight };
}

function addSoftEnvelopeGradient(
  g: number[],
  baselineG: number[],
  forward: number[],
  reverse: number[],
  tolerance: number,
  gradient: number[]
) {
  const fidelityScale = 2 * SOFT_ENVELOPE_FIDELITY_WEIGHT / g.length;
  const envelopeScale = 2 * SOFT_ENVELOPE_LAMBDA / g.length;
  for (let index = 0; index < g.length; index += 1) {
    gradient[index] += fidelityScale * (g[index] - baselineG[index]);
    if (index === 0 || index === g.length - 1) {
      gradient[index] += 2 * SOFT_ENVELOPE_ENDPOINT_FIDELITY_WEIGHT
        * (g[index] - baselineG[index]);
    }
    const lower = Math.min(forward[index], reverse[index]);
    const upper = Math.max(forward[index], reverse[index]);
    const envelopeCurrents = index === 0 || index === g.length - 1
      ? []
      : [forward[index], reverse[index]];
    for (const raw of envelopeCurrents) {
      const reconstructed = g[index] * raw;
      const upperViolation = reconstructed - upper - tolerance;
      const lowerViolation = lower - reconstructed - tolerance;
      if (upperViolation > 0) gradient[index] += envelopeScale * upperViolation * raw;
      if (lowerViolation > 0) gradient[index] -= envelopeScale * lowerViolation * raw;
    }
  }
}

function softEnvelopeOptimalityResidual(
  g: number[],
  baselineG: number[],
  forward: number[],
  reverse: number[],
  tolerance: number,
  smoothnessLambda: number,
  operator: SecondDifferenceOperator
): number {
  const gradient = new Array<number>(g.length).fill(0);
  addSoftEnvelopeGradient(g, baselineG, forward, reverse, tolerance, gradient);
  addRoughnessGradient(g, smoothnessLambda, operator, gradient);

  let residual = 0;
  for (let index = 0; index < g.length; index += 1) {
    const component = gradient[index];
    const violation = g[index] === 0
      ? Math.min(0, component)
      : g[index] === 1
        ? Math.max(0, component)
        : component;
    residual = Math.max(residual, Math.abs(violation));
  }
  return residual;
}

function softEnvelopeFidelity(g: number[], baselineG: number[]): number {
  return g.reduce((sum, value, index) =>
    sum + (value - baselineG[index]) ** 2, 0) / g.length;
}

function softEnvelopeMeanPenalty(
  g: number[],
  forward: number[],
  reverse: number[],
  tolerance: number
): number {
  let penalty = 0;
  for (let index = 0; index < g.length; index += 1) {
    const lower = Math.min(forward[index], reverse[index]);
    const upper = Math.max(forward[index], reverse[index]);
    penalty += envelopePenalty(g[index] * forward[index], lower, upper, tolerance);
    penalty += envelopePenalty(g[index] * reverse[index], lower, upper, tolerance);
  }
  return penalty / g.length;
}

function makeSoftEnvelopeDiagnostics(
  g: number[],
  baselineG: number[],
  forward: number[],
  reverse: number[],
  normalizedTolerance: number,
  currentScale: number,
  smoothnessLambda: number,
  operator: SecondDifferenceOperator,
  iterations: number,
  optimalityResidualValue: number
): DunnSoftEnvelopeResult["diagnostics"] {
  return {
    fidelityWeight: SOFT_ENVELOPE_FIDELITY_WEIGHT,
    smoothnessLambda,
    envelopeLambda: SOFT_ENVELOPE_LAMBDA,
    envelopeTolerance: normalizedTolerance * currentScale,
    iterations,
    converged: true,
    optimalityResidual: optimalityResidualValue,
    fidelity: softEnvelopeFidelity(g, baselineG),
    roughness: operatorRoughness(g, operator),
    envelopePenalty: softEnvelopeMeanPenalty(g, forward, reverse, normalizedTolerance),
    maximumSharedFractionAdjustment: Math.max(
      0,
      ...g.map((value, index) => Math.abs(value - baselineG[index]))
    )
  };
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
    const firstCoefficient = scale * 2 / (leftSpacing * (leftSpacing + rightSpacing));
    const lastCoefficient = scale * 2 / (rightSpacing * (leftSpacing + rightSpacing));
    const coefficients: [number, number, number] = [
      firstCoefficient,
      -(firstCoefficient + lastCoefficient),
      lastCoefficient
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
  const middle = values[row.indices[1]];
  return row.coefficients[0] * (values[row.indices[0]] - middle)
    + row.coefficients[2] * (values[row.indices[2]] - middle);
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

function weightedAffineInitial(
  target: number[],
  weight: number[],
  normalizedPotentials: number[]
): number[] {
  let meanPotential = 0;
  let meanTarget = 0;
  for (let index = 0; index < target.length; index += 1) {
    meanPotential += weight[index] * normalizedPotentials[index];
    meanTarget += weight[index] * target[index];
  }

  let potentialVariance = 0;
  let covariance = 0;
  for (let index = 0; index < target.length; index += 1) {
    const centeredPotential = normalizedPotentials[index] - meanPotential;
    potentialVariance += weight[index] * centeredPotential * centeredPotential;
    covariance += weight[index] * centeredPotential * (target[index] - meanTarget);
  }
  const slope = potentialVariance > Number.EPSILON ? covariance / potentialVariance : 0;
  return normalizedPotentials.map((potential) => Math.min(1, Math.max(
    0,
    meanTarget + slope * (potential - meanPotential)
  )));
}

function solveUnconstrainedBanded(
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator
): number[] | null {
  const pointCount = target.length;
  const diagonal = [...weight];
  const firstOffDiagonal = new Array<number>(Math.max(0, pointCount - 1)).fill(0);
  const secondOffDiagonal = new Array<number>(Math.max(0, pointCount - 2)).fill(0);
  const rightHandSide = weight.map((value, index) => value * target[index]);

  for (const row of operator.rows) {
    const [firstIndex, middleIndex, lastIndex] = row.indices;
    const [first, middle, last] = row.coefficients;
    diagonal[firstIndex] += lambda * first * first;
    diagonal[middleIndex] += lambda * middle * middle;
    diagonal[lastIndex] += lambda * last * last;
    firstOffDiagonal[firstIndex] += lambda * first * middle;
    firstOffDiagonal[middleIndex] += lambda * middle * last;
    secondOffDiagonal[firstIndex] += lambda * first * last;
  }

  const choleskyDiagonal = new Array<number>(pointCount).fill(0);
  const firstSubDiagonal = new Array<number>(pointCount).fill(0);
  const secondSubDiagonal = new Array<number>(pointCount).fill(0);
  for (let index = 0; index < pointCount; index += 1) {
    if (index >= 2) {
      secondSubDiagonal[index] = secondOffDiagonal[index - 2] / choleskyDiagonal[index - 2];
    }
    if (index >= 1) {
      const overlap = index >= 2
        ? secondSubDiagonal[index] * firstSubDiagonal[index - 1]
        : 0;
      firstSubDiagonal[index] = (firstOffDiagonal[index - 1] - overlap)
        / choleskyDiagonal[index - 1];
    }
    const pivot = diagonal[index]
      - firstSubDiagonal[index] * firstSubDiagonal[index]
      - secondSubDiagonal[index] * secondSubDiagonal[index];
    if (!Number.isFinite(pivot) || pivot <= 0) return null;
    choleskyDiagonal[index] = Math.sqrt(pivot);
  }

  const transformed = new Array<number>(pointCount).fill(0);
  for (let index = 0; index < pointCount; index += 1) {
    const firstContribution = index >= 1
      ? firstSubDiagonal[index] * transformed[index - 1]
      : 0;
    const secondContribution = index >= 2
      ? secondSubDiagonal[index] * transformed[index - 2]
      : 0;
    transformed[index] = (rightHandSide[index] - firstContribution - secondContribution)
      / choleskyDiagonal[index];
  }

  const solution = new Array<number>(pointCount).fill(0);
  for (let index = pointCount - 1; index >= 0; index -= 1) {
    const firstContribution = index + 1 < pointCount
      ? firstSubDiagonal[index + 1] * solution[index + 1]
      : 0;
    const secondContribution = index + 2 < pointCount
      ? secondSubDiagonal[index + 2] * solution[index + 2]
      : 0;
    const value = (transformed[index] - firstContribution - secondContribution)
      / choleskyDiagonal[index];
    if (!Number.isFinite(value)) return null;
    solution[index] = Math.min(1, Math.max(0, value));
  }
  return solution;
}

function solveProjected(
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator,
  tolerance: number,
  initial: number[],
  maximumIterations: number
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
  let next = new Array<number>(g.length).fill(0);
  let previousObjective = objective(g, target, weight, lambda, operator);
  if (!Number.isFinite(previousObjective)) throw new CvAnalysisError("reconstructionFailed");

  let residual = optimalityResidual(g, target, weight, lambda, operator, gradient);
  if (residual <= tolerance) {
    return { g, iterations: 0, converged: true, optimalityResidual: residual };
  }

  for (let iterations = 1; iterations <= maximumIterations; iterations += 1) {
    gradient.fill(0);
    addFidelityGradient(accelerated, target, weight, gradient);
    addRoughnessGradient(accelerated, lambda, operator, gradient);

    projectGradientStep(accelerated, gradient, 1 / localLipschitz, next);
    while (!majorizesObjective(
      next,
      accelerated,
      localLipschitz,
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
    const objectiveTolerance = 1e-12 * Math.max(1, Math.abs(previousObjective));
    if (nextObjective > previousObjective + objectiveTolerance) {
      copyValues(g, accelerated);
      momentum = 1;
      continue;
    }

    const previousMomentum = momentum;
    const restart = dotDifference(next, g, accelerated, next) > 0;
    momentum = restart ? 1 : (1 + Math.sqrt(1 + 4 * momentum * momentum)) / 2;
    const extrapolation = restart ? 0 : (previousMomentum - 1) / momentum;
    for (let index = 0; index < next.length; index += 1) {
      accelerated[index] = next[index] + extrapolation * (next[index] - g[index]);
    }
    const previousG = g;
    g = next;
    next = previousG;
    previousObjective = nextObjective;

    if (iterations % 10 === 0) {
      residual = optimalityResidual(g, target, weight, lambda, operator, gradient);
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
  localLipschitz: number,
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator
): boolean {
  let quadraticRemainder = 0;
  let squaredDistance = 0;
  for (let index = 0; index < next.length; index += 1) {
    const difference = next[index] - accelerated[index];
    quadraticRemainder += weight[index] * difference * difference;
    squaredDistance += difference * difference;
  }
  for (const row of operator.rows) {
    const middleDifference = next[row.indices[1]] - accelerated[row.indices[1]];
    const secondDifference = row.coefficients[0]
      * ((next[row.indices[0]] - accelerated[row.indices[0]]) - middleDifference)
      + row.coefficients[2]
      * ((next[row.indices[2]] - accelerated[row.indices[2]]) - middleDifference);
    quadraticRemainder += lambda * secondDifference * secondDifference;
  }
  const quadraticBound = localLipschitz * squaredDistance / 2;
  const roundingTolerance = 1e-12 * Math.max(
    1,
    Math.abs(quadraticRemainder),
    Math.abs(quadraticBound)
  );
  return Number.isFinite(quadraticRemainder)
    && Number.isFinite(quadraticBound)
    && quadraticRemainder <= quadraticBound + roundingTolerance;
}

function copyValues(source: number[], destination: number[]) {
  for (let index = 0; index < source.length; index += 1) {
    destination[index] = source[index];
  }
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
  operator: SecondDifferenceOperator,
  gradient = new Array<number>(g.length).fill(0)
): number {
  gradient.fill(0);
  addFidelityGradient(g, target, weight, gradient);
  addRoughnessGradient(g, lambda, operator, gradient);

  let residual = 0;
  for (let index = 0; index < g.length; index += 1) {
    const value = g[index]!;
    const component = gradient[index]!;
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
