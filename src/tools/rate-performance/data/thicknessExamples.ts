import type { RateDataset, RatePoint } from "../models/types";

export interface ThicknessExampleSample {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number;
  readonly thicknessUnit: "um";
  readonly dataset: Readonly<RateDataset>;
}

export interface ThicknessKineticsExample {
  readonly id: string;
  readonly name: string;
  readonly isExample: true;
  readonly samples: ReadonlyArray<Readonly<ThicknessExampleSample>>;
}

function exampleDataset(id: string, scale: number): Readonly<RateDataset> {
  const points = Object.freeze([
    { id: `${id}-1`, rate: 25, rateUnit: "mA-g-1", capacity: 280 * scale, capacityUnit: "mAh-g-1" },
    { id: `${id}-2`, rate: 100, rateUnit: "mA-g-1", capacity: 258 * scale, capacityUnit: "mAh-g-1" },
    { id: `${id}-3`, rate: 400, rateUnit: "mA-g-1", capacity: 196 * scale, capacityUnit: "mAh-g-1" },
    { id: `${id}-4`, rate: 1000, rateUnit: "mA-g-1", capacity: 128 * scale, capacityUnit: "mAh-g-1" },
  ].map((point) => Object.freeze(point))) as ReadonlyArray<Readonly<RatePoint>>;

  return Object.freeze({
    id,
    name: `Illustrative ${id}`,
    description: "Example-only thickness-series rate data.",
    points,
    isExample: true,
  });
}

export const THICKNESS_KINETICS_EXAMPLE: Readonly<ThicknessKineticsExample> = Object.freeze({
  id: "thickness-kinetics-example",
  name: "Illustrative electrode thickness series",
  isExample: true,
  samples: Object.freeze([
    Object.freeze({ id: "thin", sampleName: "Thin electrode", thickness: 30, thicknessUnit: "um" as const, dataset: exampleDataset("thin", 1) }),
    Object.freeze({ id: "medium", sampleName: "Medium electrode", thickness: 60, thicknessUnit: "um" as const, dataset: exampleDataset("medium", 0.96) }),
    Object.freeze({ id: "thick", sampleName: "Thick electrode", thickness: 100, thicknessUnit: "um" as const, dataset: exampleDataset("thick", 0.9) }),
  ]),
});
