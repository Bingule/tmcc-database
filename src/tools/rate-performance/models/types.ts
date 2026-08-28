export type RateUnit = "h-1" | "C-rate" | "A-g-1" | "mA-g-1";

export type CapacityUnit = "mAh-g-1" | "Ah-kg-1";

export interface RatePoint {
  readonly id: string;
  readonly rate: number | null;
  readonly rateUnit: RateUnit;
  readonly capacity: number | null;
  readonly capacityUnit: CapacityUnit;
}

export interface TheoreticalCapacityInput {
  readonly value: number;
  readonly unit: CapacityUnit;
}

export interface RateNormalizationContext {
  readonly confirmHInverseMeasuredRate?: boolean;
  readonly theoreticalCapacity?: TheoreticalCapacityInput;
}

export type RateNormalizationMethod =
  | "measured-rate-direct"
  | "specific-current"
  | "c-rate";

export interface RateNormalizationMetadata {
  readonly method: RateNormalizationMethod;
  readonly measuredRateConfirmed?: true;
  readonly theoreticalCapacity?: number;
  readonly theoreticalCapacityUnit?: CapacityUnit;
}

export interface NormalizedRatePoint {
  readonly id: string;
  readonly analysisRate: number;
  readonly analysisRateUnit: "h-1";
  readonly analysisCapacity: number;
  readonly analysisCapacityUnit: "mAh-g-1";
  readonly originalRate: number;
  readonly originalRateUnit: RateUnit;
  readonly originalCapacity: number;
  readonly originalCapacityUnit: CapacityUnit;
  readonly normalization: Readonly<RateNormalizationMetadata>;
}

export interface RateDataset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly points: ReadonlyArray<Readonly<RatePoint>>;
  readonly normalizationContext?: Readonly<RateNormalizationContext>;
  readonly isExample: boolean;
}

export type RateValidationIssueCode =
  | "missingRate"
  | "missingCapacity"
  | "nonFiniteRate"
  | "nonFiniteCapacity"
  | "nonPositiveRate"
  | "negativeCapacity"
  | "duplicateRate";

export interface RateValidationIssue {
  readonly code: RateValidationIssueCode;
  readonly severity: "error" | "warning";
  readonly pointId: string;
  readonly pointIndex: number;
  readonly field: "rate" | "capacity";
  readonly value?: number;
  readonly duplicateOfPointId?: string;
}

export interface RateValidationReport {
  readonly issues: RateValidationIssue[];
  readonly validPoints: RatePoint[];
  readonly invalidPoints: RatePoint[];
  readonly hasErrors: boolean;
}
