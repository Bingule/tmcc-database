import { rowsToCsv } from "../../../lib/toolExport";
import type { NormalizedRatePoint, RatePoint } from "../models/types";

export interface RateExportMetadata {
  readonly modelId: string;
  readonly rateDefinition: string;
  readonly normalizationBasis: string;
  readonly settings?: Readonly<Record<string, string | number | boolean>>;
}

export interface RateFitExportPoint {
  readonly rate: number;
  readonly observedCapacity: number;
  readonly fittedCapacity: number;
  readonly residual: number;
}

function metadataColumns(metadata: RateExportMetadata): Array<string> {
  return [
    metadata.modelId,
    metadata.rateDefinition,
    metadata.normalizationBasis,
    Object.entries(metadata.settings ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(";"),
  ];
}

const metadataHeaders = ["model_id", "rate_definition", "normalization_basis", "settings"];

export function serializeOriginalRateCsv(
  points: ReadonlyArray<Readonly<RatePoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    ["point_id", "rate", "rate_unit", "capacity", "capacity_unit", ...metadataHeaders],
    points.map((point) => [
      point.id,
      point.rate,
      point.rateUnit,
      point.capacity,
      point.capacityUnit,
      ...suffix,
    ]),
  );
}

export function serializeNormalizedRateCsv(
  points: ReadonlyArray<Readonly<NormalizedRatePoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    [
      "point_id",
      "analysis_rate",
      "analysis_rate_unit",
      "analysis_capacity",
      "analysis_capacity_unit",
      "original_rate",
      "original_rate_unit",
      "original_capacity",
      "original_capacity_unit",
      "normalization_method",
      ...metadataHeaders,
    ],
    points.map((point) => [
      point.id,
      point.analysisRate,
      point.analysisRateUnit,
      point.analysisCapacity,
      point.analysisCapacityUnit,
      point.originalRate,
      point.originalRateUnit,
      point.originalCapacity,
      point.originalCapacityUnit,
      point.normalization.method,
      ...suffix,
    ]),
  );
}

export function serializeRateFitCsv(
  points: ReadonlyArray<Readonly<RateFitExportPoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    [
      "rate",
      "observed_capacity",
      "fitted_capacity",
      "residual",
      "rate_unit",
      "capacity_unit",
      ...metadataHeaders,
    ],
    points.map((point) => [
      point.rate,
      point.observedCapacity,
      point.fittedCapacity,
      point.residual,
      "h-1",
      "mAh-g-1",
      ...suffix,
    ]),
  );
}

export function serializeRateParametersCsv(
  parameters: ReadonlyArray<Readonly<{ name: string; value: number | null; unit: string; type: string }>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    ["parameter", "value", "unit", "parameter_type", ...metadataHeaders],
    parameters.map((parameter) => [
      parameter.name,
      parameter.value,
      parameter.unit,
      parameter.type,
      ...suffix,
    ]),
  );
}
