import type { ChartPoint } from "../../../components/ScientificLineChart";

/**
 * Select deterministic display points without modifying or reordering the
 * scientific input. Analysis and exports must continue to use `raw`.
 */
export function sampleRateChartPoints<T extends ChartPoint>(
  raw: ReadonlyArray<T>,
  maximum: number,
): T[] {
  if (!Number.isInteger(maximum) || maximum <= 0) {
    throw new RangeError("maximum must be a positive integer");
  }
  if (raw.length <= maximum) return [...raw];
  if (maximum === 1) return [raw[0]];

  const selected: T[] = [];
  let previousIndex = -1;
  for (let index = 0; index < maximum; index += 1) {
    const rawIndex = Math.round(index * (raw.length - 1) / (maximum - 1));
    if (rawIndex !== previousIndex) selected.push(raw[rawIndex]);
    previousIndex = rawIndex;
  }
  return selected;
}
