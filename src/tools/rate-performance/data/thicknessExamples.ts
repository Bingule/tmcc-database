import type { RateDataset, RatePoint } from "../models/types";

export interface ThicknessExampleSample {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number;
  readonly thicknessUnit: "um";
  readonly massLoading?: number;
  readonly dataset: Readonly<RateDataset>;
}

export interface ThicknessKineticsExample {
  readonly id: string;
  readonly name: string;
  readonly isExample: true;
  readonly samples: ReadonlyArray<Readonly<ThicknessExampleSample>>;
}

function exampleDataset(id: string, tau: number, qM: number): Readonly<RateDataset> {
  const n = 0.68;
  const capacity = (rate: number) => {
    const scaled = (rate * tau) ** n;
    return qM * (1 - scaled * -Math.expm1(-1 / scaled));
  };
  const points = Object.freeze([0.02, 0.08, 0.3, 1, 4, 15].map((rate, index) => Object.freeze({
    id: `${id}-${index + 1}`,
    rate,
    rateUnit: "h-1" as const,
    capacity: capacity(rate),
    capacityUnit: "mAh-g-1" as const,
  }))) as ReadonlyArray<Readonly<RatePoint>>;

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
    Object.freeze({ id: "thin", sampleName: "Thin electrode", thickness: 30, thicknessUnit: "um" as const, massLoading: 2.1, dataset: exampleDataset("thin", 0.46, 310) }),
    Object.freeze({ id: "medium", sampleName: "Medium electrode", thickness: 60, thicknessUnit: "um" as const, massLoading: 4.2, dataset: exampleDataset("medium", 1.54, 305) }),
    Object.freeze({ id: "thick", sampleName: "Thick electrode", thickness: 100, thicknessUnit: "um" as const, massLoading: 7.0, dataset: exampleDataset("thick", 4.1, 298) }),
  ]),
});
