import type { EnergyCurveMode, EnergyCurvePointDraft } from "../components/EnergyCurveInput";

export type EnergyCurvePointReason = "blank-row" | "invalid-or-missing-value" | "negative-axis"
  | "negative-voltage" | "negative-adjusted-current" | "duplicate-axis" | "non-monotonic-axis"
  | "insufficient-points" | "dataset-validation-failed" | null;

export interface EnergyCurvePointValidation {
  readonly id: string; readonly parseValid: boolean; readonly scientificallyValid: boolean;
  readonly included: boolean; readonly reason: EnergyCurvePointReason;
}

export function validateEnergyCurvePoints(
  points: ReadonlyArray<Readonly<EnergyCurvePointDraft>>,
  mode: EnergyCurveMode,
  currentSign: "positive" | "negative",
) {
  let previousAxis: number | null = null;
  const preliminary = points.map((point) => {
    const blank = point.x === null && point.voltage === null && (mode === "capacity" || point.current === null);
    const parseValid = Number.isFinite(point.x) && Number.isFinite(point.voltage)
      && (mode === "capacity" || Number.isFinite(point.current));
    let reason: EnergyCurvePointReason = blank ? "blank-row" : parseValid ? null : "invalid-or-missing-value";
    if (reason === null && (point.x as number) < 0) reason = "negative-axis";
    if (reason === null && (point.voltage as number) < 0) reason = "negative-voltage";
    const adjustedCurrent = (point.current as number) * (currentSign === "negative" ? -1 : 1);
    if (reason === null && mode === "time" && adjustedCurrent < 0) reason = "negative-adjusted-current";
    if (reason === null && previousAxis !== null && point.x === previousAxis) reason = "duplicate-axis";
    if (reason === null && previousAxis !== null && (point.x as number) < previousAxis) reason = "non-monotonic-axis";
    if (reason === null) previousAxis = point.x as number;
    return { id: point.id, parseValid, scientificallyValid: reason === null, included: false, reason };
  });
  const used = preliminary.filter((point) => point.reason !== "blank-row");
  const validCount = preliminary.filter((point) => point.scientificallyValid).length;
  const canIntegrate = used.length >= 2 && validCount === used.length;
  const pointsWithInclusion = preliminary.map((point): EnergyCurvePointValidation => {
    if (canIntegrate && point.scientificallyValid) return { ...point, included: true };
    if (!canIntegrate && point.reason === null) return { ...point, reason: used.length < 2 ? "insufficient-points" : "dataset-validation-failed" };
    return point;
  });
  return {
    canIntegrate,
    points: pointsWithInclusion,
    counts: {
      parseValid: preliminary.filter((point) => point.parseValid).length,
      scientificallyValid: validCount,
      included: pointsWithInclusion.filter((point) => point.included).length,
    },
  };
}
