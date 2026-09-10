import type {
  RatePoint,
  RateValidationIssue,
  RateValidationReport,
} from "../models/types";

function pointErrors(point: RatePoint, pointIndex: number): RateValidationIssue[] {
  const issues: RateValidationIssue[] = [];

  if (point.rate === null || point.rate === undefined) {
    issues.push({
      code: "missingRate",
      severity: "error",
      pointId: point.id,
      pointIndex,
      field: "rate",
    });
  } else if (!Number.isFinite(point.rate)) {
    issues.push({
      code: "nonFiniteRate",
      severity: "error",
      pointId: point.id,
      pointIndex,
      field: "rate",
      value: point.rate,
    });
  } else if (point.rate <= 0) {
    issues.push({
      code: "nonPositiveRate",
      severity: "error",
      pointId: point.id,
      pointIndex,
      field: "rate",
      value: point.rate,
    });
  }

  if (point.capacity === null || point.capacity === undefined) {
    issues.push({
      code: "missingCapacity",
      severity: "error",
      pointId: point.id,
      pointIndex,
      field: "capacity",
    });
  } else if (!Number.isFinite(point.capacity)) {
    issues.push({
      code: "nonFiniteCapacity",
      severity: "error",
      pointId: point.id,
      pointIndex,
      field: "capacity",
      value: point.capacity,
    });
  } else if (point.capacity < 0) {
    issues.push({
      code: "negativeCapacity",
      severity: "error",
      pointId: point.id,
      pointIndex,
      field: "capacity",
      value: point.capacity,
    });
  }

  return issues;
}

export function validateRatePoints(points: ReadonlyArray<RatePoint>): RateValidationReport {
  const issues: RateValidationIssue[] = [];
  const validPoints: RatePoint[] = [];
  const invalidPoints: RatePoint[] = [];
  const firstPointByRate = new Map<string, RatePoint>();

  points.forEach((point, pointIndex) => {
    const errors = pointErrors(point, pointIndex);
    issues.push(...errors);

    if (errors.length > 0) {
      invalidPoints.push(point);
      return;
    }

    validPoints.push(point);
    const key = `${point.rateUnit}:${point.rate}`;
    const duplicateOf = firstPointByRate.get(key);
    if (duplicateOf) {
      issues.push({
        code: "duplicateRate",
        severity: "warning",
        pointId: point.id,
        pointIndex,
        field: "rate",
        value: point.rate ?? undefined,
        duplicateOfPointId: duplicateOf.id,
      });
    } else {
      firstPointByRate.set(key, point);
    }
  });

  return {
    issues,
    validPoints,
    invalidPoints,
    hasErrors: invalidPoints.length > 0,
  };
}
