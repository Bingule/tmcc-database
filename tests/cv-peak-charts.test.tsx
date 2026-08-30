import { act } from "react";
import { readFile } from "node:fs/promises";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CvPeakOverviewChart } from "../src/components/CvPeakOverviewChart";
import { CvPeakRegressionChart } from "../src/components/CvPeakRegressionChart";
import { CvPeakAnalysisPanel, formatCompact, naturalLog, type CvPeakPanelCopy } from "../src/components/CvPeakAnalysisPanel";
import { analyzePeakBValues } from "../src/lib/cvPeakAnalysis";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousReactActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

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
  logScanRate: "ln(ν / (mV·s⁻¹))",
  logCurrent: "ln(|i| / arb. units)",
  copyAction: "Copy selected columns",
  copyColumns: "Select column to copy",
  copySuccess: "Copied selected columns.",
  copyError: "Could not copy selected columns.",
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
  fitStatusLabel: (status) => status
};

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (previousReactActEnvironment) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousReactActEnvironment);
  else Reflect.deleteProperty(reactActEnvironment, "IS_REACT_ACT_ENVIRONMENT");
});

describe("peak b-value charts", () => {
  it("keeps compact peak-table CSS overrides after generic table rules", async () => {
    const css = await readFile("src/styles/global.css", "utf8");
    const genericTableRule = css.lastIndexOf(".tool-result-table th,");
    const compactTableRule = css.lastIndexOf(".cv-peak-points-card .cv-peak-points-table th,");
    expect(compactTableRule).toBeGreaterThan(genericTableRule);
    const compactRule = css.slice(compactTableRule, css.indexOf("}", compactTableRule) + 1);
    expect(compactRule).toContain("padding: 6px 4px");
    expect(compactRule).toContain("font-size: 0.82rem");
    const compactHeadingStart = css.lastIndexOf(".cv-peak-points-card .cv-peak-column-heading {");
    const compactHeadingRule = css.slice(compactHeadingStart, css.indexOf("}", compactHeadingStart) + 1);
    expect(compactHeadingRule).toContain("display: grid");
    const compactInputRule = css.slice(css.lastIndexOf(".cv-peak-points-card .cv-peak-column-heading input"), css.indexOf("}", css.lastIndexOf(".cv-peak-points-card .cv-peak-column-heading input")) + 1);
    expect(compactInputRule).toContain("height: 15px");
    expect(compactInputRule).toContain("min-height: 0");
    expect(compactInputRule).toContain("padding: 0");
    const compactHeadingTextStart = css.lastIndexOf(".cv-peak-points-card .cv-peak-heading-text,");
    const compactHeadingTextRule = css.slice(compactHeadingTextStart, css.indexOf("}", compactHeadingTextStart) + 1);
    expect(compactHeadingTextRule).toContain("letter-spacing: 0");
    expect(compactHeadingTextRule).toContain("text-transform: none");
  });

  it("formats compact values and natural logs at their boundaries", () => {
    expect(formatCompact(0, "—")).toBe("0");
    expect(formatCompact(100000, "—")).toBe("1.000e+5");
    expect(formatCompact(0.00001, "—")).toBe("1.000e-5");
    expect(formatCompact(12.345678, "—")).toBe("12.346");
    expect(formatCompact(null, "—")).toBe("—");
    expect(formatCompact(Number.NaN, "—")).toBe("—");
    expect(formatCompact(Number.POSITIVE_INFINITY, "—")).toBe("—");
    expect(naturalLog(null)).toBeNull();
    expect(naturalLog(0)).toBeNull();
    expect(naturalLog(-1)).toBeNull();
    expect(naturalLog(Number.NaN)).toBeNull();
    expect(naturalLog(1)).toBe(0);
  });

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

  it("renders compact regression columns and copies only checked peak-point columns", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
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

    const table = container.querySelector<HTMLTableElement>('[data-table-id="cv-peak-points"]')!;
    const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent?.trim());
    expect(table.querySelectorAll("colgroup col")).toHaveLength(6);
    expect(Array.from(table.querySelectorAll("colgroup col")).map((col) => (col as HTMLElement).style.width))
      .toEqual(["11%", "14%", "21%", "19%", "16%", "19%"]);
    expect(Array.from(table.querySelectorAll("thead [data-peak-short-label]")).map((node) => node.textContent))
      .toEqual(["Peak", "ν", "E", "i", "ln ν", "ln |i|"]);
    expect(Array.from(table.querySelectorAll("thead [data-peak-unit]")).map((node) => node.textContent))
      .toEqual(["(mV/s)", "(V)", "(arb.)"]);
    expect(table.querySelector("thead")?.textContent).not.toContain("Scan rate");
    expect(headers).toEqual(["Peak", "ν(mV/s)", "E(V)", "i(arb.)", "ln ν", "ln |i|"]);
    expect(table.textContent).not.toContain("Original source index");
    expect(table.textContent).not.toContain("Point status");
    expect(table.querySelectorAll('thead input[type="checkbox"]')).toHaveLength(6);

    const firstPoint = result.fits[0]!.points[0]!;
    const firstRow = table.querySelector("tbody tr")!;
    function formatExpectedCompact(value: number): string {
      if (value === 0) return "0";
      const magnitude = Math.abs(value);
      if (magnitude >= 1e5 || magnitude < 1e-4) return value.toExponential(3);
      return Number(value.toPrecision(5)).toString();
    }
    expect(firstRow.querySelector('[data-peak-cell="scanRate"]')?.textContent).toBe(String(firstPoint.scanRate));
    expect(firstRow.querySelector('[data-peak-cell="scanRate"]')?.textContent).not.toContain("mV/s");
    expect(firstRow.querySelector<HTMLInputElement>("input")?.defaultValue).toBe(String(firstPoint.candidate!.potential));
    expect(firstRow.querySelector('[data-peak-cell="current"]')?.textContent).toBe(formatExpectedCompact(firstPoint.candidate!.current));
    expect(firstRow.querySelector('[data-peak-cell="logScanRate"]')?.textContent).toBe(formatExpectedCompact(Math.log(firstPoint.scanRate)));
    expect(firstRow.querySelector('[data-peak-cell="logCurrent"]')?.textContent).toBe(formatExpectedCompact(Math.log(Math.abs(firstPoint.candidate!.current))));
    expect(table.querySelector('thead label[title="Scan rate"]')).not.toBeNull();
    expect(table.querySelector('thead input[aria-label="Select column to copy: Scan rate"]')).not.toBeNull();

    const copyButton = container.querySelector<HTMLButtonElement>('[data-peak-copy-toolbar] button')!;
    expect(copyButton.disabled).toBe(true);
    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="peak"]')!.click());
    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="logScanRate"]')!.click());
    await act(async () => copyButton.click());

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied.split("\r\n")[0]).toBe(`${panelCopy.peak}\t${panelCopy.logScanRate}`);
    expect(copied.split("\r\n")[1]).toBe(`${panelCopy.peak} ${result.fits[0]!.labelIndex}\t${Number(Math.log(firstPoint.scanRate).toFixed(6)).toString()}`);
    expect(copied.split("\r\n")).toHaveLength(16);
    expect(container.querySelector('[data-peak-copy-toolbar]')?.textContent).toContain(panelCopy.copySuccess);

    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="scanRate"]')!.click());
    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="potential"]')!.click());
    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="current"]')!.click());
    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="peak"]')!.click());
    await act(async () => table.querySelector<HTMLInputElement>('thead input[value="logScanRate"]')!.click());
    await act(async () => copyButton.click());
    const exactCopied = writeText.mock.calls[1]![0] as string;
    const exactFirstRow = exactCopied.split("\r\n")[1]!;
    expect(exactCopied.split("\r\n")[0]).toBe("Scan rate\tPotential\tCurrent");
    expect(exactFirstRow).toBe(`${firstPoint.scanRate} mV/s\t${Number(firstPoint.candidate!.potential.toFixed(6))}\t${Number(firstPoint.candidate!.current.toFixed(6))}`);

    const chineseCopy: CvPeakPanelCopy = {
      ...panelCopy,
      peak: "峰值",
      scanRate: "扫描速率",
      potential: "电位",
      current: "电流",
      logScanRate: "扫描速率自然对数",
      logCurrent: "电流绝对值自然对数",
      copyColumns: "选择要复制的列"
    };
    await act(async () => root.render(<CvPeakAnalysisPanel
      series={series} result={result} selectedPeakId="peak-1" selectedSeriesIndex={0}
      onPeakChange={() => undefined} onSeriesChange={() => undefined} onPotentialSelect={() => undefined}
      onAdjustPotential={() => undefined} onConfirm={() => undefined} onExclude={() => undefined}
      onRestore={() => undefined} onAddPeak={() => undefined} onRemovePeak={() => undefined} copy={chineseCopy}
    />));
    const chineseTable = container.querySelector<HTMLTableElement>('[data-table-id="cv-peak-points"]')!;
    expect(chineseTable.querySelector('thead label[title="扫描速率"]')).not.toBeNull();
    expect(chineseTable.querySelector('thead input[aria-label="选择要复制的列: 扫描速率"]')).not.toBeNull();

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

  it("keeps peak control callbacks and the add limit intact", async () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
    const onConfirm = vi.fn();
    const onExclude = vi.fn();
    const onRestore = vi.fn();
    const onAddPeak = vi.fn();
    const onRemovePeak = vi.fn();
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
      onConfirm={onConfirm}
      onExclude={onExclude}
      onRestore={onRestore}
      onAddPeak={onAddPeak}
      onRemovePeak={onRemovePeak}
      copy={panelCopy}
    />));

    const pointActions = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-peak-control-row="point-actions"] button'));
    const peakActions = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-peak-control-row="peak-actions"] button'));
    await act(async () => {
      pointActions[0]!.click();
      pointActions[1]!.click();
      pointActions[2]!.click();
      peakActions[0]!.click();
      peakActions[1]!.click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onExclude).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onAddPeak).toHaveBeenCalledTimes(1);
    expect(onRemovePeak).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<CvPeakAnalysisPanel
      series={series}
      result={{ ...result, maximumPeakCount: result.fits.length as typeof result.maximumPeakCount }}
      selectedPeakId="peak-1"
      selectedSeriesIndex={0}
      onPeakChange={() => undefined}
      onSeriesChange={() => undefined}
      onPotentialSelect={() => undefined}
      onAdjustPotential={() => undefined}
      onConfirm={onConfirm}
      onExclude={onExclude}
      onRestore={onRestore}
      onAddPeak={onAddPeak}
      onRemovePeak={onRemovePeak}
      copy={panelCopy}
    />));
    expect(container.querySelector<HTMLButtonElement>('[data-peak-control-row="peak-actions"] button')?.disabled).toBe(true);

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

  it("does not plot a regression-ineligible near-zero point after it is confirmed", async () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
    const fit = result.fits[0]!;
    const confirmedNearZero = {
      ...fit,
      points: fit.points.map((point, index) => index === 0
        ? { ...point, status: "confirmed" as const, regressionEligible: false }
        : point)
    };
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => root.render(<CvPeakRegressionChart
      fits={[confirmedNearZero]}
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
    />));

    expect(container.querySelectorAll('[data-peak-regression-point="peak-1"]')).toHaveLength(fit.points.length - 1);
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
