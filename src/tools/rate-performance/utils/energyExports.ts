import { rowsToCsv } from "../../../lib/toolExport";
import type {
  EnergyPowerResult,
  RagonePoint,
  SummaryEnergyPowerInput,
} from "../analysis/energyPower";

export interface EnergyExportMetadata {
  readonly resultKind: "example" | "user";
  readonly exampleId: string | null;
}

export function serializeEnergyOriginalCsv(
  samples: ReadonlyArray<Readonly<SummaryEnergyPowerInput>>,
  metadata: Readonly<EnergyExportMetadata>,
) {
  return rowsToCsv([
    "sample_id", "capacity_original", "capacity_unit", "average_voltage_V",
    "discharge_time_original", "discharge_time_unit", "normalization_basis",
    "mass_g", "volume_cm3", "input_method", "result_kind", "example_id",
  ], samples.map((sample) => [
    sample.sampleId, sample.specificCapacity, sample.capacityUnit, sample.averageVoltage,
    sample.dischargeTime, sample.dischargeTimeUnit, sample.normalizationBasis,
    sample.massG ?? null, sample.volumeCm3 ?? null, "summary-average-voltage",
    metadata.resultKind, metadata.exampleId,
  ]));
}

export function serializeEnergyResultsCsv(
  results: ReadonlyArray<Readonly<EnergyPowerResult>>,
  metadata: Readonly<EnergyExportMetadata>,
  sampleIds: ReadonlyArray<string> = [],
) {
  return rowsToCsv([
    "sample_id", "status", "specific_energy_Wh_kg-1", "specific_power_W_kg-1",
    "volumetric_energy_Wh_L-1", "volumetric_power_W_L-1", "integration_method",
    "normalization_basis", "energy_unit", "power_unit", "failure_code",
    "failure_point_ids", "result_kind", "example_id",
  ], results.map((result, index) => result.status === "success" ? [
    result.sampleId, result.status, result.specificEnergyWhKg, result.specificPowerWKg,
    result.volumetricEnergyWhL, result.volumetricPowerWL, result.integrationMethod,
    result.normalizationBasis, "Wh kg^-1", "W kg^-1", null, null,
    metadata.resultKind, metadata.exampleId,
  ] : [
    sampleIds[index] ?? null, result.status, null, null, null, null, null, null, "Wh kg^-1", "W kg^-1",
    result.code, result.pointIds.join("|"), metadata.resultKind, metadata.exampleId,
  ]));
}

export function serializeRagoneCsv(
  points: ReadonlyArray<Readonly<RagonePoint>>,
  metadata: Readonly<EnergyExportMetadata>,
) {
  return rowsToCsv([
    "sample_id", "specific_energy_Wh_kg-1", "specific_power_W_kg-1",
    "normalization_basis", "result_kind", "example_id",
  ], points.map((point) => [
    point.sampleId, point.energyWhKg, point.powerWKg, point.normalizationBasis,
    metadata.resultKind, metadata.exampleId,
  ]));
}

export interface EnergyCurveExportPoint {
  readonly id: string;
  readonly x: number | null;
  readonly voltage: number | null;
  readonly current?: number | null;
}

export function serializeEnergyCurveCsv(
  points: ReadonlyArray<Readonly<EnergyCurveExportPoint>>,
  context: Readonly<{ mode: "capacity" | "time"; xUnit: string; currentUnit: string | null; basis: string }>,
  metadata: Readonly<EnergyExportMetadata>,
) {
  return rowsToCsv([
    "point_id", "axis_value", "axis_type", "axis_unit", "voltage_V", "current",
    "current_unit", "normalization_basis", "result_kind", "example_id",
  ], points.map((point) => [
    point.id, point.x, context.mode, context.xUnit, point.voltage, point.current ?? null,
    context.currentUnit, context.basis, metadata.resultKind, metadata.exampleId,
  ]));
}
