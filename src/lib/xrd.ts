import { cellToVectors, fractionalToCartesian, type ParsedCrystalStructure } from "./crystal";

export type RadiationPreset = {
  label: string;
  wavelength: number;
};

export type XrdPeak = {
  twoTheta: number;
  intensity: number;
  hkl: string;
  dSpacing: number;
};

export type XrdPoint = {
  twoTheta: number;
  intensity: number;
};

export type XrdPattern = {
  peaks: XrdPeak[];
  points: XrdPoint[];
};

export type PairDistributionPoint = {
  r: number;
  intensity: number;
};

export const radiationPresets: RadiationPreset[] = [
  { label: "Cu Kalpha", wavelength: 1.5406 },
  { label: "Mo Kalpha", wavelength: 0.7107 },
  { label: "Co Kalpha", wavelength: 1.78897 },
  { label: "Ag Kalpha", wavelength: 0.5609 }
];

const atomicNumbers: Record<string, number> = {
  C: 6,
  N: 7,
  S: 16,
  Ti: 22,
  V: 23,
  Cr: 24,
  Mn: 25,
  Fe: 26,
  Co: 27,
  Ni: 28,
  Cu: 29,
  Zn: 30,
  Zr: 40,
  Nb: 41,
  Mo: 42,
  Hf: 72,
  Ta: 73,
  W: 74
};

export function simulateXrdPattern(
  structure: ParsedCrystalStructure,
  options: { wavelength: number; minTwoTheta: number; maxTwoTheta: number; step?: number; peakWidth?: number }
): XrdPattern {
  const minTwoTheta = Math.max(0.1, Math.min(options.minTwoTheta, options.maxTwoTheta - 0.1));
  const maxTwoTheta = Math.min(179.9, Math.max(options.maxTwoTheta, minTwoTheta + 0.1));
  const step = options.step ?? 0.05;
  const peakWidth = options.peakWidth ?? 0.16;
  const peaks = normalizePeaks(mergeClosePeaks(generatePeaks(structure, options.wavelength, minTwoTheta, maxTwoTheta)));
  const points: XrdPoint[] = [];

  for (let twoTheta = minTwoTheta; twoTheta <= maxTwoTheta + step / 2; twoTheta += step) {
    const intensity = peaks.reduce((sum, peak) => {
      const offset = (twoTheta - peak.twoTheta) / peakWidth;
      return sum + peak.intensity * Math.exp(-0.5 * offset * offset);
    }, 0);
    points.push({ twoTheta: round(twoTheta, 3), intensity: round(Math.min(intensity, 100), 4) });
  }

  return { peaks, points };
}

export function exportXrdCsv(points: XrdPoint[]) {
  return [
    "two_theta_deg,intensity",
    ...points.map((point) => `${point.twoTheta.toFixed(3)},${point.intensity.toFixed(4)}`)
  ].join("\n");
}

export function exportPairDistributionCsv(points: PairDistributionPoint[]) {
  return [
    "r_angstrom,intensity",
    ...points.map((point) => `${point.r.toFixed(3)},${point.intensity.toFixed(4)}`)
  ].join("\n");
}

export function simulatePairDistribution(
  structure: ParsedCrystalStructure,
  options: { wavelength: number; minTwoTheta: number; maxTwoTheta: number; step?: number; rMin?: number; rMax?: number }
): PairDistributionPoint[] {
  const maxTwoTheta = Math.min(179.9, Math.max(options.maxTwoTheta, options.minTwoTheta + 0.1));
  const qMax = 4 * Math.PI * Math.sin(degreesToRadians(maxTwoTheta / 2)) / options.wavelength;
  const sigma = Math.max(0.045, Math.PI / Math.max(qMax, 0.1) / 2.2);
  const rStep = options.step ?? 0.04;
  const rMin = Math.max(0, Math.min(options.rMin ?? 0, (options.rMax ?? 12) - rStep));
  const rMax = Math.max(rMin + rStep, options.rMax ?? 12);
  const vectors = cellToVectors(structure.cell);
  const atoms = structure.atoms.map((atom) => ({
    element: atom.element,
    position: fractionalToCartesian(atom.fract, vectors)
  }));
  const pairDistances: { distance: number; weight: number }[] = [];

  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = 0; j < atoms.length; j += 1) {
      for (let u = -2; u <= 2; u += 1) {
        for (let v = -2; v <= 2; v += 1) {
          for (let w = -1; w <= 1; w += 1) {
            if (i === j && u === 0 && v === 0 && w === 0) continue;
            const translated = add(add(add(atoms[j].position, scale(vectors[0], u)), scale(vectors[1], v)), scale(vectors[2], w));
            const distance = length([
              translated[0] - atoms[i].position[0],
              translated[1] - atoms[i].position[1],
              translated[2] - atoms[i].position[2]
            ]);
            if (distance > 0.1 && distance <= rMax) {
              pairDistances.push({
                distance,
                weight: (atomicNumbers[atoms[i].element] ?? 10) * (atomicNumbers[atoms[j].element] ?? 10) / Math.max(distance * distance, 0.1)
              });
            }
          }
        }
      }
    }
  }

  const points: PairDistributionPoint[] = [];
  const start = Math.max(rStep, Math.ceil(rMin / rStep) * rStep);
  for (let r = start; r <= rMax + rStep / 2; r += rStep) {
    const intensity = pairDistances.reduce((sum, pair) => {
      const offset = (r - pair.distance) / sigma;
      return sum + pair.weight * Math.exp(-0.5 * offset * offset);
    }, 0);
    points.push({ r: round(r, 3), intensity });
  }

  const maxIntensity = Math.max(...points.map((point) => point.intensity), 0);
  return maxIntensity > 0
    ? points.map((point) => ({ ...point, intensity: round(point.intensity / maxIntensity * 100, 4) }))
    : points;
}

function generatePeaks(
  structure: ParsedCrystalStructure,
  wavelength: number,
  minTwoTheta: number,
  maxTwoTheta: number
) {
  const reciprocal = reciprocalVectors(cellToVectors(structure.cell));
  const minD = wavelength / (2 * Math.sin(degreesToRadians(maxTwoTheta / 2)));
  const maxIndex = Math.ceil(Math.max(structure.cell.a, structure.cell.b, structure.cell.c) / minD) + 2;
  const peaks: XrdPeak[] = [];

  for (let h = -maxIndex; h <= maxIndex; h += 1) {
    for (let k = -maxIndex; k <= maxIndex; k += 1) {
      for (let l = -maxIndex; l <= maxIndex; l += 1) {
        if (h === 0 && k === 0 && l === 0) continue;
        const g = add(add(scale(reciprocal[0], h), scale(reciprocal[1], k)), scale(reciprocal[2], l));
        const gLength = length(g);
        if (gLength <= 0) continue;
        const dSpacing = 1 / gLength;
        const sinTheta = wavelength / (2 * dSpacing);
        if (sinTheta <= 0 || sinTheta >= 1) continue;
        const twoTheta = 2 * radiansToDegrees(Math.asin(sinTheta));
        if (twoTheta < minTwoTheta || twoTheta > maxTwoTheta) continue;
        const structureFactor = calculateStructureFactor(structure, h, k, l);
        const theta = degreesToRadians(twoTheta / 2);
        const lorentzPolarization = (1 + Math.cos(2 * theta) ** 2) / Math.max(Math.sin(theta) ** 2 * Math.cos(theta), 0.01);
        const intensity = structureFactor * lorentzPolarization;
        if (intensity > 0.001) {
          peaks.push({
            twoTheta,
            intensity,
            hkl: `${h} ${k} ${l}`,
            dSpacing
          });
        }
      }
    }
  }

  return peaks.sort((a, b) => a.twoTheta - b.twoTheta);
}

function calculateStructureFactor(structure: ParsedCrystalStructure, h: number, k: number, l: number) {
  let real = 0;
  let imaginary = 0;
  for (const atom of structure.atoms) {
    const scattering = atomicNumbers[atom.element] ?? 10;
    const phase = 2 * Math.PI * (h * atom.fract[0] + k * atom.fract[1] + l * atom.fract[2]);
    real += scattering * Math.cos(phase);
    imaginary += scattering * Math.sin(phase);
  }
  return real * real + imaginary * imaginary;
}

function mergeClosePeaks(peaks: XrdPeak[]) {
  const merged: XrdPeak[] = [];
  for (const peak of peaks) {
    const existing = merged.find((item) => Math.abs(item.twoTheta - peak.twoTheta) < 0.08);
    if (!existing) {
      merged.push({ ...peak });
      continue;
    }
    const totalIntensity = existing.intensity + peak.intensity;
    existing.twoTheta = (existing.twoTheta * existing.intensity + peak.twoTheta * peak.intensity) / totalIntensity;
    existing.dSpacing = (existing.dSpacing * existing.intensity + peak.dSpacing * peak.intensity) / totalIntensity;
    existing.intensity = totalIntensity;
    existing.hkl = `${existing.hkl}; ${peak.hkl}`;
  }
  return merged;
}

function normalizePeaks(peaks: XrdPeak[]) {
  const maxIntensity = Math.max(...peaks.map((peak) => peak.intensity), 0);
  if (maxIntensity <= 0) return peaks;
  return peaks.map((peak) => ({
    ...peak,
    twoTheta: round(peak.twoTheta, 3),
    dSpacing: round(peak.dSpacing, 4),
    intensity: round(peak.intensity / maxIntensity * 100, 4)
  }));
}

function reciprocalVectors(
  vectors: [[number, number, number], [number, number, number], [number, number, number]]
) {
  const [a, b, c] = vectors;
  const volume = dot(a, cross(b, c));
  return [
    scale(cross(b, c), 1 / volume),
    scale(cross(c, a), 1 / volume),
    scale(cross(a, b), 1 / volume)
  ] as [[number, number, number], [number, number, number], [number, number, number]];
}

function add(a: [number, number, number], b: [number, number, number]) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as [number, number, number];
}

function scale(vector: [number, number, number], factor: number) {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor] as [number, number, number];
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ] as [number, number, number];
}

function length(vector: [number, number, number]) {
  return Math.sqrt(dot(vector, vector));
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI;
}

function round(value: number, digits: number) {
  const scaleFactor = 10 ** digits;
  return Math.round(value * scaleFactor) / scaleFactor;
}
