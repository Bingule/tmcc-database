export type EnergyNormalizationBasis = "active-material" | "electrode" | "device";
export type EnergyCapacityUnit = "mAh-g-1" | "Ah-kg-1" | "mAh";

export interface SummaryEnergyPowerInput {
  readonly sampleId: string;
  readonly specificCapacity: number;
  readonly capacityUnit: EnergyCapacityUnit;
  readonly averageVoltage: number;
  readonly dischargeTime: number;
  readonly dischargeTimeUnit: "s" | "min" | "h";
  readonly normalizationBasis: EnergyNormalizationBasis;
  readonly massG?: number;
  readonly volumeCm3?: number;
}

export type EnergyPowerFailureCode =
  | "invalid-input"
  | "insufficient-points"
  | "mass-required"
  | "duplicate-axis"
  | "non-monotonic-axis"
  | "numerical-overflow";

export interface EnergyPowerFailure {
  readonly status: "failure";
  readonly code: EnergyPowerFailureCode;
  readonly pointIds: ReadonlyArray<string>;
}

export interface EnergyPowerSuccess {
  readonly status: "success";
  readonly sampleId: string;
  readonly normalizationBasis: EnergyNormalizationBasis;
  readonly specificEnergyWhKg: number;
  readonly specificPowerWKg: number | null;
  readonly volumetricEnergyWhL: number | null;
  readonly volumetricPowerWL: number | null;
  readonly integrationMethod: "average-voltage" | "trapezoidal-v-dq" | "trapezoidal-v-i-dt";
  readonly pointCount: number;
}

export type EnergyPowerResult = EnergyPowerSuccess | EnergyPowerFailure;

export interface CapacityCurvePoint {
  readonly id: string;
  readonly capacity: number;
  readonly voltage: number;
}

export interface TimeCurvePoint {
  readonly id: string;
  readonly time: number;
  readonly voltage: number;
  readonly current: number;
}

export type DischargeCurveNormalization =
  | Readonly<{
    mode: "capacity";
    capacityUnit: EnergyCapacityUnit;
    normalizationBasis: EnergyNormalizationBasis;
    sampleId?: string;
    massG?: number;
    volumeCm3?: number;
    dischargeTimeHours?: number;
  }>
  | Readonly<{
    mode: "time";
    timeUnit: "s" | "min" | "h";
    currentUnit: "mA" | "A" | "mA-g-1" | "A-g-1";
    normalizationBasis: EnergyNormalizationBasis;
    sampleId?: string;
    massG?: number;
    volumeCm3?: number;
  }>;

export interface RagonePoint {
  readonly sampleId: string;
  readonly energyWhKg: number;
  readonly powerWKg: number;
  readonly normalizationBasis: EnergyNormalizationBasis;
}

export function calculateSummaryEnergyPower(input: Readonly<SummaryEnergyPowerInput>): EnergyPowerResult {
  if (!input.sampleId || !positive(input.specificCapacity) || !positive(input.averageVoltage)
    || !positive(input.dischargeTime) || !optionalPositive(input.massG) || !optionalPositive(input.volumeCm3)) {
    return failure("invalid-input");
  }
  const specificCapacity = toAhKg(input.specificCapacity, input.capacityUnit, input.massG);
  if (specificCapacity === "mass-required") return failure("mass-required");
  const hours = input.dischargeTime * timeToHours(input.dischargeTimeUnit);
  const energy = specificCapacity * input.averageVoltage;
  const power = energy / hours;
  return success({
    sampleId: input.sampleId,
    normalizationBasis: input.normalizationBasis,
    energy,
    power,
    massG: input.massG,
    volumeCm3: input.volumeCm3,
    method: "average-voltage",
    pointCount: 1,
  });
}

export function integrateDischargeCurve(
  points: ReadonlyArray<Readonly<CapacityCurvePoint | TimeCurvePoint>>,
  normalization: DischargeCurveNormalization,
): EnergyPowerResult {
  if (points.length < 2 || !optionalPositive(normalization.massG) || !optionalPositive(normalization.volumeCm3)) {
    return points.length < 2 ? failure("insufficient-points", points.map(({ id }) => id)) : failure("invalid-input");
  }
  return normalization.mode === "capacity"
    ? integrateCapacity(points as ReadonlyArray<Readonly<CapacityCurvePoint>>, normalization)
    : integrateTime(points as ReadonlyArray<Readonly<TimeCurvePoint>>, normalization);
}

export function toRagonePoints(results: ReadonlyArray<Readonly<EnergyPowerResult>>): RagonePoint[] {
  return results.flatMap((result) => result.status === "success" && result.specificPowerWKg !== null
    ? [{
      sampleId: result.sampleId,
      energyWhKg: result.specificEnergyWhKg,
      powerWKg: result.specificPowerWKg,
      normalizationBasis: result.normalizationBasis,
    }]
    : []);
}

function integrateCapacity(
  points: ReadonlyArray<Readonly<CapacityCurvePoint>>,
  normalization: Extract<DischargeCurveNormalization, { mode: "capacity" }>,
): EnergyPowerResult {
  const invalid = points.filter((point) => !point.id || !finiteNonNegative(point.capacity) || !finiteNonNegative(point.voltage));
  if (invalid.length > 0 || (normalization.dischargeTimeHours !== undefined && !positive(normalization.dischargeTimeHours))) {
    return failure("invalid-input", invalid.map(({ id }) => id));
  }
  const orderFailure = validateAxis(points.map(({ id, capacity: axis }) => ({ id, axis })));
  if (orderFailure) return orderFailure;
  if (normalization.capacityUnit === "mAh" && !positive(normalization.massG)) return failure("mass-required");

  let energy = 0;
  for (let index = 1; index < points.length; index += 1) {
    const deltaCapacity = points[index].capacity - points[index - 1].capacity;
    const specificDelta = toAhKg(deltaCapacity, normalization.capacityUnit, normalization.massG);
    if (specificDelta === "mass-required") return failure("mass-required");
    energy += ((points[index - 1].voltage + points[index].voltage) / 2) * specificDelta;
  }
  const power = normalization.dischargeTimeHours === undefined ? null : energy / normalization.dischargeTimeHours;
  return success({
    sampleId: normalization.sampleId ?? "discharge-curve",
    normalizationBasis: normalization.normalizationBasis,
    energy,
    power,
    massG: normalization.massG,
    volumeCm3: normalization.volumeCm3,
    method: "trapezoidal-v-dq",
    pointCount: points.length,
  });
}

function integrateTime(
  points: ReadonlyArray<Readonly<TimeCurvePoint>>,
  normalization: Extract<DischargeCurveNormalization, { mode: "time" }>,
): EnergyPowerResult {
  const invalid = points.filter((point) => !point.id || !finiteNonNegative(point.time)
    || !finiteNonNegative(point.voltage) || !finiteNonNegative(point.current));
  if (invalid.length > 0) return failure("invalid-input", invalid.map(({ id }) => id));
  const orderFailure = validateAxis(points.map(({ id, time: axis }) => ({ id, axis })));
  if (orderFailure) return orderFailure;
  if ((normalization.currentUnit === "mA" || normalization.currentUnit === "A") && !positive(normalization.massG)) {
    return failure("mass-required");
  }

  let energy = 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    const leftPower = left.voltage * currentToAKg(left.current, normalization.currentUnit, normalization.massG);
    const rightPower = right.voltage * currentToAKg(right.current, normalization.currentUnit, normalization.massG);
    const hours = (right.time - left.time) * timeToHours(normalization.timeUnit);
    energy += ((leftPower + rightPower) / 2) * hours;
  }
  const durationHours = (points.at(-1)!.time - points[0].time) * timeToHours(normalization.timeUnit);
  return success({
    sampleId: normalization.sampleId ?? "discharge-curve",
    normalizationBasis: normalization.normalizationBasis,
    energy,
    power: energy / durationHours,
    massG: normalization.massG,
    volumeCm3: normalization.volumeCm3,
    method: "trapezoidal-v-i-dt",
    pointCount: points.length,
  });
}

function validateAxis(points: ReadonlyArray<Readonly<{ id: string; axis: number }>>): EnergyPowerFailure | null {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].axis === points[index - 1].axis) return failure("duplicate-axis", [points[index - 1].id, points[index].id]);
    if (points[index].axis < points[index - 1].axis) return failure("non-monotonic-axis", [points[index - 1].id, points[index].id]);
  }
  return null;
}

function toAhKg(value: number, unit: EnergyCapacityUnit, massG?: number): number | "mass-required" {
  if (unit === "mAh-g-1" || unit === "Ah-kg-1") return value;
  return positive(massG) ? value / massG : "mass-required";
}

function currentToAKg(value: number, unit: "mA" | "A" | "mA-g-1" | "A-g-1", massG?: number): number {
  if (unit === "mA-g-1") return value;
  if (unit === "A-g-1") return value * 1000;
  if (unit === "mA") return value / (massG as number);
  return (value * 1000) / (massG as number);
}

function success(input: Readonly<{
  sampleId: string; normalizationBasis: EnergyNormalizationBasis; energy: number; power: number | null;
  massG?: number; volumeCm3?: number; method: EnergyPowerSuccess["integrationMethod"]; pointCount: number;
}>): EnergyPowerResult {
  if (!Number.isFinite(input.energy) || (input.power !== null && !Number.isFinite(input.power))) return failure("numerical-overflow");
  const densityKgL = positive(input.massG) && positive(input.volumeCm3) ? input.massG / input.volumeCm3 : null;
  return {
    status: "success", sampleId: input.sampleId, normalizationBasis: input.normalizationBasis,
    specificEnergyWhKg: input.energy, specificPowerWKg: input.power,
    volumetricEnergyWhL: densityKgL === null ? null : input.energy * densityKgL,
    volumetricPowerWL: densityKgL === null || input.power === null ? null : input.power * densityKgL,
    integrationMethod: input.method, pointCount: input.pointCount,
  };
}

function failure(code: EnergyPowerFailureCode, pointIds: ReadonlyArray<string> = []): EnergyPowerFailure {
  return { status: "failure", code, pointIds: [...pointIds] };
}
function timeToHours(unit: "s" | "min" | "h") { return unit === "s" ? 1 / 3600 : unit === "min" ? 1 / 60 : 1; }
function positive(value: number | undefined): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function optionalPositive(value: number | undefined) { return value === undefined || positive(value); }
function finiteNonNegative(value: number) { return Number.isFinite(value) && value >= 0; }
