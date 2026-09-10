import type { RateDataset, RatePoint } from "../models/types";

const points = Object.freeze([
  { id: "rate-example-1", rate: 20, rateUnit: "mA-g-1", capacity: 302, capacityUnit: "mAh-g-1" },
  { id: "rate-example-2", rate: 50, rateUnit: "mA-g-1", capacity: 296, capacityUnit: "mAh-g-1" },
  { id: "rate-example-3", rate: 100, rateUnit: "mA-g-1", capacity: 284, capacityUnit: "mAh-g-1" },
  { id: "rate-example-4", rate: 250, rateUnit: "mA-g-1", capacity: 252, capacityUnit: "mAh-g-1" },
  { id: "rate-example-5", rate: 500, rateUnit: "mA-g-1", capacity: 211, capacityUnit: "mAh-g-1" },
  { id: "rate-example-6", rate: 1000, rateUnit: "mA-g-1", capacity: 162, capacityUnit: "mAh-g-1" },
].map((point) => Object.freeze(point))) as ReadonlyArray<Readonly<RatePoint>>;

export const RATE_PERFORMANCE_EXAMPLE: Readonly<RateDataset> = Object.freeze({
  id: "rate-performance-example",
  name: "Illustrative specific-current rate dataset",
  description: "Example-only capacity data for demonstrating the measured-rate workflow.",
  points,
  isExample: true,
});
