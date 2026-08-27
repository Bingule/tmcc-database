import type { CvSeries } from "../../src/lib/cvTypes";

type PeakDefinition = {
  branch: "forward" | "reverse";
  center: number;
  width: number;
  exponent: number;
  amplitude: number;
  shiftPerLogRate: number;
};

export function makeThreePeakNcpLikeSeries(): CvSeries[] {
  return makePeakSeries([
    { branch: "forward", center: -0.54, width: 0.045, exponent: 0.72, amplitude: 0.55, shiftPerLogRate: 0.004 },
    { branch: "forward", center: -0.41, width: 0.09, exponent: 0.81, amplitude: 1.4, shiftPerLogRate: 0.035 },
    { branch: "reverse", center: -0.68, width: 0.10, exponent: 0.66, amplitude: 1.2, shiftPerLogRate: -0.04 }
  ]);
}

export function makePartialPeakSeries(): CvSeries[] {
  return makePeakSeries([
    { branch: "forward", center: -0.3, width: 0.07, exponent: 0.75, amplitude: 1, shiftPerLogRate: 0.01 },
    { branch: "reverse", center: 0.2, width: 0.06, exponent: 0.6, amplitude: 0.7, shiftPerLogRate: -0.01 }
  ], new Set(["reverse:2", "reverse:20"]));
}

export function makeManyPeakSeries(count = 12): CvSeries[] {
  return makePeakSeries(Array.from({ length: count }, (_, index) => ({
    branch: index % 2 === 0 ? "forward" as const : "reverse" as const,
    center: -0.9 + 1.8 * (index + 1) / (count + 1),
    width: 0.025,
    exponent: 0.55 + 0.03 * (index % 8),
    amplitude: 0.8 + 0.05 * index,
    shiftPerLogRate: (index % 3 - 1) * 0.004
  })));
}

function makePeakSeries(definitions: PeakDefinition[], missing = new Set<string>()): CvSeries[] {
  const rates = [1, 2, 5, 10, 20];
  const grid = Array.from({ length: 401 }, (_, index) => -1 + 2 * index / 400);
  return rates.map((scanRate, seriesIndex) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [...grid, ...grid.slice(0, -1).reverse()].map((potential, pointIndex, potentials) => {
      const delta = pointIndex === 0 ? potentials[1]! - potential : potential - potentials[pointIndex - 1]!;
      const branch = delta >= 0 ? "forward" : "reverse";
      const sign = branch === "forward" ? 1 : -1;
      const baseline = sign * (0.04 + 0.015 * potential) * Math.sqrt(scanRate);
      const peakCurrent = definitions
        .filter((peak) => peak.branch === branch && !missing.has(`${branch}:${scanRate}`))
        .reduce((sum, peak) => {
          const center = peak.center + peak.shiftPerLogRate * Math.log(scanRate);
          const shape = Math.exp(-Math.pow((potential - center) / peak.width, 2));
          return sum + sign * peak.amplitude * Math.pow(scanRate, peak.exponent) * shape;
        }, 0);
      const ripple = 1e-5 * Math.sin((pointIndex + 1) * (seriesIndex + 2));
      return { potential, current: baseline + peakCurrent + ripple };
    })
  }));
}
