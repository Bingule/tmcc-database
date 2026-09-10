import type { RateFitFailureCode } from "./fitRatePerformance";

export type CaFitAttemptStatus = "not-run" | "pending" | "converged" | "failed" | "cancelled" | "error";

export interface CaFitAttempt {
  readonly modelId: "rational-characteristic-time";
  readonly status: CaFitAttemptStatus;
  readonly failureCode?: RateFitFailureCode | "unexpected-error";
  readonly attemptedPointCount: number;
  readonly usedPointCount?: number;
}

export const INITIAL_CA_FIT_ATTEMPT: CaFitAttempt = {
  modelId: "rational-characteristic-time",
  status: "not-run",
  attemptedPointCount: 0,
};
