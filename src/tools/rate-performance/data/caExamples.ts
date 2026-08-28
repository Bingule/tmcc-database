export interface CaExamplePoint {
  readonly time: number;
  readonly current: number;
}

export interface CaRateExample {
  readonly id: string;
  readonly name: string;
  readonly isExample: true;
  readonly timeUnit: "s";
  readonly currentUnit: "mA";
  readonly activeMassG: number;
  readonly sign: "positive";
  readonly baselineCorrection: "off";
  readonly points: ReadonlyArray<Readonly<CaExamplePoint>>;
}

export const CA_RATE_EXAMPLE: Readonly<CaRateExample> = Object.freeze({
  id: "ca-rate-example",
  name: "Illustrative chronoamperometry trace",
  isExample: true,
  timeUnit: "s",
  currentUnit: "mA",
  activeMassG: 0.01,
  sign: "positive",
  baselineCorrection: "off",
  points: Object.freeze([
    Object.freeze({ time: 0, current: 8 }),
    Object.freeze({ time: 30, current: 5.6 }),
    Object.freeze({ time: 60, current: 4.1 }),
    Object.freeze({ time: 120, current: 2.7 }),
    Object.freeze({ time: 240, current: 1.5 }),
  ]),
});
