export type EnergyNormalizationBasis = "active-material" | "electrode" | "device";

export interface EnergyPowerExampleSample {
  readonly id: string;
  readonly sampleName: string;
  readonly specificCapacity: number;
  readonly capacityUnit: "mAh-g-1";
  readonly averageVoltage: number;
  readonly dischargeTimeHours: number;
  readonly normalizationBasis: EnergyNormalizationBasis;
}

export interface EnergyPowerExample {
  readonly id: string;
  readonly name: string;
  readonly isExample: true;
  readonly samples: ReadonlyArray<Readonly<EnergyPowerExampleSample>>;
}

export const ENERGY_POWER_EXAMPLE: Readonly<EnergyPowerExample> = Object.freeze({
  id: "energy-power-example",
  name: "Illustrative active-material energy and power comparison",
  isExample: true,
  samples: Object.freeze([
    Object.freeze({
      id: "sample-low-rate",
      sampleName: "Low-rate example",
      specificCapacity: 260,
      capacityUnit: "mAh-g-1",
      averageVoltage: 3.6,
      dischargeTimeHours: 5,
      normalizationBasis: "active-material",
    }),
    Object.freeze({
      id: "sample-high-rate",
      sampleName: "High-rate example",
      specificCapacity: 185,
      capacityUnit: "mAh-g-1",
      averageVoltage: 3.45,
      dischargeTimeHours: 0.5,
      normalizationBasis: "active-material",
    }),
  ]),
});
