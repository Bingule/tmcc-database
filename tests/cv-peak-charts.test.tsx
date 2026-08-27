import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CvPeakOverviewChart } from "../src/components/CvPeakOverviewChart";
import { CvPeakRegressionChart } from "../src/components/CvPeakRegressionChart";
import { CvPeakAnalysisPanel, type CvPeakPanelCopy } from "../src/components/CvPeakAnalysisPanel";
import { analyzePeakBValues } from "../src/lib/cvPeakAnalysis";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

const containers: HTMLDivElement[] = [];

const panelCopy: CvPeakPanelCopy = {
  overview: "Multi-scan-rate CV peak overview",
  regression: "Peak-current b-value regressions",
  peak: "Peak",
  scanRate: "Scan rate",
  potential: "Potential",
  current: "Current",
  branch: "Sweep branch",
  kind: "Peak kind",
  forward: "Forward",
  reverse: "Reverse",
  oxidation: "Oxidation peak",
  reduction: "Reduction peak",
  bValue: "b value",
  intercept: "Intercept",
  rSquared: "R²",
  fitPoints: "Fit points",
  coverage: "Scan-rate coverage",
  fitStatus: "Fit status",
  pointStatus: "Point status",
  sourceIndex: "Original source index",
  confirm: "Confirm point",
  exclude: "Exclude point",
  restore: "Restore automatic point",
  add: "Add peak",
  remove: "Remove peak",
  noPeaks: "No significant peaks were detected.",
  summary: "Peak summary",
  adjustments: "Peak-point adjustments",
  legend: "Legend",
  empty: "No fit",
  xPotential: "Potential (V)",
  yCurrent: "Current",
  xLogRate: "log(scan rate)",
  yLogCurrent: "log(|peak current|)",
  complete: "Complete",
  partial: "Partial",
  unavailable: "—",
  fitStatusLabel: (status) => status,
  pointStatusLabel: (status) => status
};

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
});

describe("peak b-value charts", () => {
  it("composes full-width controls, summaries, and auditable point rows", async () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () => root.render(<CvPeakAnalysisPanel
      series={series}
      result={result}
      selectedPeakId="peak-1"
      selectedSeriesIndex={0}
      onPeakChange={() => undefined}
      onSeriesChange={() => undefined}
      onPotentialSelect={() => undefined}
      onAdjustPotential={() => undefined}
      onConfirm={() => undefined}
      onExclude={() => undefined}
      onRestore={() => undefined}
      onAddPeak={() => undefined}
      onRemovePeak={() => undefined}
      copy={panelCopy}
    />));

    expect(container.querySelector('[data-panel-id="cv-peak-analysis"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-table-id="cv-peak-summary"] tbody tr')).toHaveLength(3);
    expect(container.querySelectorAll('[data-table-id="cv-peak-points"] tbody tr')).toHaveLength(15);
    expect(container.querySelector<HTMLSelectElement>('select[name="selectedPeakId"]')?.value).toBe("peak-1");
    expect(container.querySelector<HTMLSelectElement>('select[name="selectedPeakSeriesIndex"]')?.value).toBe("0");
    await act(async () => root.unmount());
  });

  it("groups peak selection controls into selector and action rows", async () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => root.render(<CvPeakAnalysisPanel
      series={series}
      result={result}
      selectedPeakId="peak-1"
      selectedSeriesIndex={0}
      onPeakChange={() => undefined}
      onSeriesChange={() => undefined}
      onPotentialSelect={() => undefined}
      onAdjustPotential={() => undefined}
      onConfirm={() => undefined}
      onExclude={() => undefined}
      onRestore={() => undefined}
      onAddPeak={() => undefined}
      onRemovePeak={() => undefined}
      copy={panelCopy}
    />));

    const selectors = container.querySelector('[data-peak-control-row="selectors"]');
    expect(Array.from(selectors?.querySelectorAll("label") ?? []).map((label) => label.childNodes[0]?.textContent)).toEqual([
      panelCopy.peak,
      panelCopy.scanRate
    ]);
    expect(Array.from(container.querySelectorAll('[data-peak-control-row="point-actions"] button')).map((button) => button.textContent)).toEqual([
      panelCopy.confirm,
      panelCopy.exclude,
      panelCopy.restore
    ]);
    const peakActions = Array.from(container.querySelectorAll('[data-peak-control-row="peak-actions"] button'));
    expect(peakActions.map((button) => button.textContent)).toEqual([panelCopy.add, panelCopy.remove]);
    expect(peakActions.every((button) => button.classList.contains("secondary-button"))).toBe(true);

    await act(async () => root.unmount());
  });

  it("shows all matched peak points, stable labels, and independent regression lines", async () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => root.render(<>
      <CvPeakOverviewChart
        series={series}
        fits={result.fits}
        selectedPeakId="peak-1"
        selectedSeriesIndex={0}
        title="Multi-scan-rate CV peak overview"
        xLabel="Potential (V)"
        yLabel="Current"
        legendLabel="Legend"
        peakLabel={(index) => `Peak ${index}`}
        oxidationLabel="Oxidation peak"
        reductionLabel="Reduction peak"
        exportId="cv-peak-overview-chart"
      />
      <CvPeakRegressionChart
        fits={result.fits}
        title="Peak-current b-value regressions"
        xLabel="log(scan rate)"
        yLabel="log(|peak current|)"
        emptyLabel="No fit"
        legendLabel="Legend"
        peakLabel={(index) => `Peak ${index}`}
        forwardLabel="Forward"
        reverseLabel="Reverse"
        oxidationLabel="Oxidation peak"
        reductionLabel="Reduction peak"
        exportId="cv-peak-regression-chart"
      />
    </>));

    expect(container.querySelectorAll("[data-peak-marker]")).toHaveLength(15);
    expect(container.querySelectorAll('[data-peak-kind="oxidation"]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-peak-kind="reduction"]')).toHaveLength(5);
    expect(container.querySelectorAll("[data-peak-regression-line]")).toHaveLength(3);
    expect(container.querySelector('[data-peak-label="Peak 1"]')).not.toBeNull();
    expect(container.querySelector('svg[data-export-id="cv-peak-overview-chart"]')).not.toBeNull();
    expect(container.querySelector('svg[data-export-id="cv-peak-regression-chart"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("maps plot clicks to a potential while keeping branch and rate selection in the parent", async () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
    const onSelectPotential = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => root.render(<CvPeakOverviewChart
      series={series}
      fits={result.fits}
      selectedPeakId="peak-1"
      selectedSeriesIndex={3}
      onSelectPotential={onSelectPotential}
      title="Overview"
      xLabel="Potential (V)"
      yLabel="Current"
      legendLabel="Legend"
      peakLabel={(index) => `Peak ${index}`}
      oxidationLabel="Oxidation peak"
      reductionLabel="Reduction peak"
      exportId="cv-peak-overview-chart"
    />));

    const svg = container.querySelector<SVGSVGElement>("svg")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500,
      toJSON: () => ({})
    });
    const target = container.querySelector<SVGRectElement>("[data-peak-click-target]")!;
    await act(async () => target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 420, clientY: 250 })));

    expect(onSelectPotential).toHaveBeenCalledTimes(1);
    expect(onSelectPotential.mock.calls[0]![0]).toBeGreaterThanOrEqual(-1);
    expect(onSelectPotential.mock.calls[0]![0]).toBeLessThanOrEqual(1);
    const marker = container.querySelector<SVGElement>('[data-peak-id="peak-1"][data-series-index="3"]')!;
    expect(marker.getAttribute("role")).toBe("button");
    expect(marker.getAttribute("aria-label")).toContain("Peak 1");

    await act(async () => root.unmount());
  });
});
