import { rowsToCsv } from "../../../lib/toolExport";
import type {
  EnergyPowerResult,
  RagonePoint,
  SummaryEnergyPowerInput,
} from "../analysis/energyPower";
import type { EnergyCurveSource } from "../components/EnergyCurveInput";
import { validateEnergyCurvePoints } from "./energyCurveValidation";

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
    "failure_point_ids", "point_count", "result_kind", "example_id",
  ], results.map((result, index) => result.status === "success" ? [
    result.sampleId, result.status, result.specificEnergyWhKg, result.specificPowerWKg,
    result.volumetricEnergyWhL, result.volumetricPowerWL, result.integrationMethod,
    result.normalizationBasis, "Wh kg^-1", "W kg^-1", null, null, result.pointCount,
    metadata.resultKind, metadata.exampleId,
  ] : [
    sampleIds[index] ?? null, result.status, null, null, null, null, null, null, "Wh kg^-1", "W kg^-1",
    result.code, result.pointIds.join("|"), null, metadata.resultKind, metadata.exampleId,
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
export interface EnergyCurveExportContext {
  readonly sampleId: string; readonly sampleName: string; readonly mode: "capacity" | "time";
  readonly xUnit: string; readonly currentUnit: string | null; readonly currentSign: "positive" | "negative";
  readonly basis: string; readonly massG: number | null; readonly volumeCm3: number | null;
  readonly dischargeTimeHours: number | null; readonly integrationMethod: "trapezoidal-v-dq" | "trapezoidal-v-i-dt";
  readonly integrationSucceeded: boolean; readonly source: EnergyCurveSource;
}

const curveHeaders = [
  "sample_id", "sample_name", "point_id", "axis_value", "axis_type", "axis_unit", "voltage_V",
  "current_original", "current_unit", "current_sign", "normalization_basis", "mass_g", "volume_cm3",
  "discharge_time_h", "integration_method", "selected_interval", "validation_status",
  "included_in_integration", "exclusion_reason", "source_kind", "file_name", "sheet_name",
  "header_mode", "has_header", "source_row_number", "mapped_axis_index", "mapped_axis_name",
  "mapped_voltage_index", "mapped_voltage_name", "mapped_current_index", "mapped_current_name",
  "all_headers_json", "raw_header_json", "raw_row_json", "source_edited", "result_kind", "example_id",
];

export function serializeEnergyCurveCsv(
  points: ReadonlyArray<Readonly<EnergyCurveExportPoint>>,
  context: Readonly<EnergyCurveExportContext>,
  metadata: Readonly<EnergyExportMetadata>,
) {
  return rowsToCsv(curveHeaders, curveRows(points, context, metadata));
}

export function serializeEnergyCurvesCsv(
  samples: ReadonlyArray<Readonly<{ points: ReadonlyArray<Readonly<EnergyCurveExportPoint>>; context: Readonly<EnergyCurveExportContext> }>>,
  metadata: Readonly<EnergyExportMetadata>,
) {
  return rowsToCsv(curveHeaders, samples.flatMap((sample) => curveRows(sample.points, sample.context, metadata)));
}

function curveRows(points: ReadonlyArray<Readonly<EnergyCurveExportPoint>>, context: Readonly<EnergyCurveExportContext>, metadata: Readonly<EnergyExportMetadata>) {
  const upload = context.source.kind === "upload" ? context.source : null;
  const rowCount = Math.max(points.length, upload?.rawRows.length ?? 0);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const raw = upload?.rawRows[index];
    return { point: points[index] ?? pointFromRaw(context.sampleId, context.mode, upload, raw, index), raw };
  });
  const validation = validateEnergyCurvePoints(rows.map(({ point }) => point), context.mode, context.currentSign);
  const mappingValid = upload === null || validSourceMapping(upload, context.mode);
  return rows.map(({ point, raw: sourceRaw }, index) => {
    const pointValidation = validation.points[index];
    const included = mappingValid && context.integrationSucceeded && pointValidation.included;
    const raw = sourceRaw ?? { rowNumber: index + 1, cells: context.mode === "time" ? [point.x, point.voltage, point.current ?? null] : [point.x, point.voltage] };
    return [
      context.sampleId, context.sampleName, point.id, point.x, context.mode, context.xUnit, point.voltage,
      point.current ?? null, context.currentUnit, context.currentSign, context.basis, context.massG,
      context.volumeCm3, context.dischargeTimeHours, context.integrationMethod, "full-curve",
      mappingValid ? pointValidation.parseValid ? pointValidation.scientificallyValid ? "valid" : "scientifically-invalid" : pointValidation.reason === "blank-row" ? "unused" : "parse-invalid" : "mapping-invalid",
      included ? "true" : "false", included ? null : mappingValid ? pointValidation.reason ?? "integration-failed" : "mapping-invalid",
      context.source.kind, upload?.fileName ?? null, upload?.sheetName ?? null, upload?.headerMode ?? null,
      upload ? String(upload.hasHeader) : null, raw.rowNumber, upload?.mapping.x?.index ?? null,
      upload?.mapping.x?.name ?? null, upload?.mapping.voltage?.index ?? null, upload?.mapping.voltage?.name ?? null,
      upload?.mapping.current?.index ?? null, upload?.mapping.current?.name ?? null, upload ? JSON.stringify(upload.allHeaders) : null,
      upload?.rawHeader ? JSON.stringify(upload.rawHeader) : null, JSON.stringify(raw.cells), context.source.kind === "manual" ? String(context.source.edited) : null,
      metadata.resultKind, metadata.exampleId,
    ];
  });
}

function pointFromRaw(sampleId: string, mode: "capacity" | "time", source: Extract<EnergyCurveSource, { kind: "upload" }> | null, raw: Readonly<{ rowNumber: number; cells: ReadonlyArray<string | number | null> }> | undefined, index: number): EnergyCurveExportPoint {
  const cell = (column: { index: number } | null) => column && raw ? numericCell(raw.cells[column.index]) : Number.NaN;
  return { id: `${sampleId}-source-${raw?.rowNumber ?? index + 1}`, x: cell(source?.mapping.x ?? null), voltage: cell(source?.mapping.voltage ?? null), current: mode === "time" ? cell(source?.mapping.current ?? null) : null };
}
function validSourceMapping(source: Extract<EnergyCurveSource, { kind: "upload" }>, mode: "capacity" | "time") { const columns = mode === "time" ? [source.mapping.x, source.mapping.voltage, source.mapping.current] : [source.mapping.x, source.mapping.voltage]; return columns.every((column) => column !== null && column.index >= 0 && column.index < source.allHeaders.length) && new Set(columns.map((column) => column?.index)).size === columns.length; }
function numericCell(value: string | number | null | undefined) { if (value == null || (typeof value === "string" && value.trim() === "")) return null; const numeric = typeof value === "number" ? value : Number(value); return Number.isFinite(numeric) ? numeric : Number.NaN; }
