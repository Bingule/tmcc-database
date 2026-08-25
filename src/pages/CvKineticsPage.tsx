import { useRef, useState } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ScientificLineChart, type ChartSeries } from "../components/ScientificLineChart";
import { useI18n } from "../i18n/I18nProvider";
import { analyzeBValue, analyzeDunn, interpolateCommonGrid } from "../lib/cvAnalysis";
import { confirmCvSeries, CvParseError, parseCvFile, type CvParseErrorCode, type ParsedCvTable } from "../lib/cvParsing";
import type { BValuePoint, CvSeries, DunnAnalysisResult, InterpolatedCvData } from "../lib/cvTypes";
import { downloadCsv, downloadPng, downloadSvg, rowsToCsv } from "../lib/toolExport";

interface AnalysisState {
  series: CvSeries[];
  grid: InterpolatedCvData;
  bValues: BValuePoint[];
  dunn: DunnAnalysisResult;
}

const csvFiles = [
  "cv-interpolated-data.csv",
  "cv-b-value-results.csv",
  "cv-dunn-k1-k2.csv",
  "cv-capacitive-current.csv",
  "cv-diffusion-current.csv",
  "cv-contribution-summary.csv"
] as const;
export const MAX_CHART_POINTS = 2_000;
const MAX_CHART_GAP_RUNS = 500;
export const MAX_CHART_OUTPUT_POINTS = 4_000;
const MAX_TABLE_ROWS = 500;
const MAX_POTENTIAL_OPTIONS = 500;

export function CvKineticsPage() {
  const { t } = useI18n();
  const [table, setTable] = useState<ParsedCvTable | null>(null);
  const [rates, setRates] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [selectedPotential, setSelectedPotential] = useState<number | undefined>();
  const [selectedRate, setSelectedRate] = useState<number | undefined>();
  const [errorCode, setErrorCode] = useState<CvParseErrorCode | "noOverlap" | "noBFit" | "analysis" | "export" | null>(null);
  const importVersion = useRef(0);
  const valid = Boolean(analysis && analysis.bValues.length > 0 && analysis.dunn.points.length > 0 && analysis.dunn.contributions.length > 0);

  async function importFile(file: File | undefined) {
    if (!file) return;
    const version = ++importVersion.current;
    setErrorCode(null);
    setTable(null);
    setRates([]);
    setAnalysis(null);
    try {
      const parsed = await parseCvFile(file);
      if (version !== importVersion.current) return;
      setTable(parsed);
      setRates(parsed.currentColumns.map((column) => column.inferredScanRate === null ? "" : String(column.inferredScanRate)));
    } catch (error) {
      if (version !== importVersion.current) return;
      setTable(null);
      setRates([]);
      setErrorCode(error instanceof CvParseError ? error.code : "analysis");
    }
  }

  function handleCsvExport(filename: typeof csvFiles[number]) {
    if (!analysis) return;
    setErrorCode(null);
    try { exportCsv(filename, analysis, t); }
    catch { setErrorCode("export"); }
  }

  async function handleFigureExport(id: string, type: "svg" | "png") {
    setErrorCode(null);
    try { await exportFigure(id, type); }
    catch { setErrorCode("export"); }
  }

  function runAnalysis() {
    if (!table) return;
    setErrorCode(null);
    setAnalysis(null);
    try {
      if (rates.some((rate) => rate.trim() === "")) throw new CvParseError("missingScanRate");
      const parsedRates = rates.map((rate) => rate.trim() === "" ? Number.NaN : Number(rate));
      const series = confirmCvSeries(table, parsedRates);
      const grid = interpolateCommonGrid(series);
      const bValues = analyzeBValue(grid);
      const dunn = analyzeDunn(grid);
      if (bValues.length === 0) throw new PageAnalysisError("noBFit");
      if (dunn.points.length === 0 || dunn.contributions.length === 0) throw new PageAnalysisError("analysis");
      setAnalysis({ series, grid, bValues, dunn });
      setSelectedPotential(bValues[0].potential);
      setSelectedRate([...dunn.contributions].sort((left, right) => left.scanRate - right.scanRate)[0].scanRate);
    } catch (error) {
      if (error instanceof CvParseError) setErrorCode(error.code);
      else if (error instanceof PageAnalysisError) setErrorCode(error.code);
      else if (error instanceof Error && error.message === "noCommonPotentialRange") setErrorCode("noOverlap");
      else setErrorCode("analysis");
    }
  }

  const selectedB = analysis?.bValues.find((point) => point.potential === selectedPotential);
  const selectedContribution = analysis?.dunn.contributions.find((item) => item.scanRate === selectedRate);
  const selectedSeriesIndex = analysis?.grid.scanRates.findIndex((rate) => rate === selectedRate) ?? -1;
  const selectedOriginalSeries = analysis?.series.find((item) => item.scanRate === selectedRate);
  const sortedContributions = [...(analysis?.dunn.contributions ?? [])].sort((left, right) => left.scanRate - right.scanRate);
  const potentialOptions = downsampleValues((analysis?.bValues ?? []).map((point) => point.potential), MAX_POTENTIAL_OPTIONS);
  if (selectedPotential !== undefined && !potentialOptions.includes(selectedPotential)) potentialOptions.unshift(selectedPotential);
  const bByPotential = new Map((analysis?.bValues ?? []).map((point) => [point.potential, point]));
  const bChart: ChartSeries[] = analysis ? [{
    id: "b-values", label: t("cv.b.value"), color: "#16697a",
    points: analysis.grid.potentials.map((potential) => ({ x: potential, y: bByPotential.get(potential)?.b ?? null }))
  }] : [];
  const fitChart = sampleChartSeries(makeFitChart(selectedB, t("cv.b.fitData")));
  const dunnChart = sampleChartSeries(makeDunnChart(analysis, selectedOriginalSeries, selectedContribution, selectedSeriesIndex, t));
  const contributionChart = sampleChartSeries(makeContributionChart(sortedContributions, t));
  const sampledBChart = sampleChartSeries(bChart);
  const bGapRunCount = countNullRuns(bChart[0]?.points ?? []);
  const missingBFitCount = analysis ? analysis.grid.potentials.length - analysis.bValues.length : 0;

  return (
    <section className="tools-page cv-page">
      <Breadcrumbs current={t("cv.title")} />
      <header className="tool-page-header">
        <h1>{t("cv.title")}</h1>
        <p>{t("cv.subtitle")}</p>
        <p>{t("cv.chart.samplingNotice", {
          target: MAX_CHART_POINTS,
          maximum: MAX_CHART_OUTPUT_POINTS
        })}</p>
      </header>

      <div className="tool-layout">
        <section className="tool-section cv-import">
          <h2>{t("cv.import.title")}</h2>
          <p>{t("cv.import.help")}</p>
          <p>{t("cv.import.accepted")}</p>
          <label>{t("cv.upload")}<input aria-label={t("cv.aria.file")} type="file" accept=".csv,.txt,.xlsx" onChange={(event) => void importFile(event.currentTarget.files?.[0])} /></label>
          <p className="tool-validation" aria-live="polite" role="status">{errorCode ? errorMessage(errorCode, t) : ""}</p>
        </section>

      <section className="tool-section cv-preview">
        <h2>{t("cv.preview.title")}</h2>
        {!table ? <p>{t("cv.preview.empty")}</p> : <>
          <h3>{t("cv.preview.mapping")}</h3>
          <p>{t("cv.preview.potentialColumn")}: <strong>{table.headers[table.potentialColumn]}</strong></p>
          <div className="cv-rate-grid">
            {table.currentColumns.map((column, index) => <label key={column.column}>
              {t("cv.preview.currentColumn")}: {column.header} — {t("cv.scanRate")} (mV/s)
              <input name="scanRate" type="number" step="any" value={rates[index]} aria-label={t("cv.aria.rate", { header: column.header })}
                onChange={(event) => {
                  setRates((current) => current.map((value, rateIndex) => rateIndex === index ? event.target.value : value));
                  setErrorCode(null);
                  setAnalysis(null); setSelectedPotential(undefined); setSelectedRate(undefined);
                }} />
            </label>)}
          </div>
          <h3>{t("cv.preview.rows")}</h3>
          <DataTable headers={table.headers} rows={table.rows.slice(0, 5)} />
          <p>{t("cv.analysis.notice")}</p>
          <button type="button" onClick={runAnalysis}>{t("cv.analysis.run")}</button>
        </>}
      </section>

      <section className="tool-section cv-b-analysis">
        <h2>{t("cv.b.title")}</h2><p>{t("cv.b.help")}</p>
        <label>{t("cv.results.potential")} (V)<select name="selectedPotential" value={selectedPotential ?? ""} onChange={(event) => setSelectedPotential(Number(event.target.value))}>
          {potentialOptions.map((potential) => <option key={potential} value={potential}>{potential}</option>)}
        </select></label>
        {analysis && missingBFitCount > 0 && <p role="status">{t("cv.b.missingFits", { count: missingBFitCount, total: analysis.grid.potentials.length })}</p>}
        {bGapRunCount > MAX_CHART_GAP_RUNS && <p role="status">{t("cv.chart.tooManyGaps")}</p>}
        <ScientificLineChart title={t("cv.b.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.b.value")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={sampledBChart} selectedX={selectedPotential} onSelectX={setSelectedPotential} exportId="cv-b-chart" />
        <DataTable headers={[`${t("cv.table.potential")} (V)`, t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.table.pointCount")]}
          rows={(analysis?.bValues ?? []).map((point) => [point.potential, point.b, point.intercept, point.rSquared, point.pointCount])} />
        <ScientificLineChart title={t("cv.b.fitChart")} xLabel={t("cv.b.logRate")} yLabel={t("cv.b.logCurrent")}
          emptyLabel={t("cv.results.noFit")} legendLabel={t("cv.chart.legend")} series={fitChart} exportId="cv-fit-chart" />
        <DataTable headers={[t("cv.results.potential"), t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.results.points")]}
          rows={selectedB ? [[selectedB.potential, selectedB.b, selectedB.intercept, selectedB.rSquared, selectedB.pointCount]] : []} />
      </section>

      <section className="tool-section cv-dunn-analysis">
        <h2>{t("cv.dunn.title")}</h2><p>{t("cv.dunn.help")}</p>
        <label>{t("cv.results.rate")} (mV/s)<select name="selectedRate" value={selectedRate ?? ""} onChange={(event) => setSelectedRate(Number(event.target.value))}>
          {sortedContributions.map((item) => <option key={item.scanRate} value={item.scanRate}>{item.scanRate}</option>)}
        </select></label>
        <ScientificLineChart title={t("cv.dunn.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.table.currentArbitrary")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={dunnChart} selectedX={selectedPotential} exportId="cv-dunn-chart" />
        <DataTable tableId="cv-original-current-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.originalMeasured")]}
          rows={(selectedOriginalSeries?.points ?? []).map((point) => [point.potential, point.current])} />
        <DataTable tableId="cv-dunn-current-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.interpolatedInput"), t("cv.dunn.reconstructedTotalUnits"), t("cv.dunn.capacitive") + " (arb. units)", t("cv.dunn.diffusion") + " (arb. units)"]}
          rows={dunnRows(analysis, selectedContribution, selectedSeriesIndex)} />
      </section>

      <section className="tool-section tool-section-wide cv-results">
        <h2>{t("cv.results.title")}</h2>
        <ScientificLineChart title={t("cv.dunn.contributionChart")} xLabel={`${t("cv.table.scanRate")} (mV/s)`} yLabel="%"
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={contributionChart} exportId="cv-contribution-chart" />
        <DataTable tableId="cv-contribution-table" headers={[`${t("cv.table.scanRate")} (mV/s)`, t("cv.dunn.capacitive") + " (%)", t("cv.dunn.diffusion") + " (%)"]}
          rows={sortedContributions.map((item) => [item.scanRate, item.capacitivePercent, item.diffusionPercent])} />
        <DataTable headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.k1"), t("cv.dunn.k2"), t("cv.results.rSquared"), t("cv.table.pointCount")]}
          rows={(analysis?.dunn.points ?? []).map((point) => [point.potential, point.k1, point.k2, point.rSquared, point.pointCount])} />
      </section>

      <section className="tool-section tool-section-wide cv-export">
        <h2>{t("cv.export.title")}</h2><h3>{t("cv.export.csv")}</h3>
        {csvFiles.map((filename) => <button key={filename} type="button" disabled={!valid} onClick={() => handleCsvExport(filename)}>{filename}</button>)}
        <h3>{t("cv.export.figures")}</h3>
        {(["cv-b-chart", "cv-fit-chart", "cv-dunn-chart", "cv-contribution-chart"] as const).flatMap((id) => [
          <button key={`${id}-svg`} type="button" disabled={!valid} onClick={() => void handleFigureExport(id, "svg")}>{t("cv.export.svg")} — {id}.svg</button>,
          <button key={`${id}-png`} type="button" disabled={!valid} onClick={() => void handleFigureExport(id, "png")}>{t("cv.export.png")} — {id}.png</button>
        ])}
      </section>
      </div>
    </section>
  );
}

export default CvKineticsPage;

class PageAnalysisError extends Error { constructor(readonly code: "noBFit" | "analysis") { super(code); } }

function errorMessage(code: CvParseErrorCode | "noOverlap" | "noBFit" | "analysis" | "export", t: ReturnType<typeof useI18n>["t"]) {
  const keys = {
    emptyFile: "cv.error.emptyFile", malformedFile: "cv.error.malformedFile", potentialColumnMissing: "cv.error.potentialColumnMissing",
    currentColumnsMissing: "cv.error.currentColumnsMissing", missingScanRate: "cv.error.missingScanRate", duplicateScanRate: "cv.error.duplicateScanRate",
    invalidScanRate: "cv.error.invalidScanRate", insufficientSeries: "cv.error.insufficientSeries", resourceLimitExceeded: "cv.error.resourceLimitExceeded", noOverlap: "cv.error.noOverlap",
    noBFit: "cv.error.noBFit", analysis: "cv.error.analysis", export: "cv.error.export"
  } as const;
  return t(keys[code]);
}

function DataTable({ headers, rows, tableId }: { headers: string[]; rows: Array<Array<string | number | null>>; tableId?: string }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  const displayedRows = rows.slice(0, MAX_TABLE_ROWS);
  return <div className="tool-table-wrap"><table data-table-id={tableId}><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead>
    <tbody>{displayedRows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{format(cell)}</td>)}</tr>)}</tbody></table>
    {rows.length > displayedRows.length && <p role="status">{t("cv.table.showingRows", { shown: displayedRows.length, total: rows.length })}</p>}</div>;
}

function format(value: string | number | null) { return typeof value === "number" ? Number(value.toPrecision(7)).toString() : value ?? "—"; }

function makeFitChart(point: BValuePoint | undefined, measuredLabel: string): ChartSeries[] {
  if (!point) return [];
  const fitPoints = [...point.fitPoints].sort((left, right) => left.logScanRate - right.logScanRate);
  const xs = fitPoints.map((item) => item.logScanRate);
  return [
    { id: "fit-points", label: measuredLabel, color: "#16697a", mode: "points", points: fitPoints.map((item) => ({ x: item.logScanRate, y: item.logCurrentMagnitude })) },
    { id: "fit-line", label: "log(|i|) = log(a) + b log(v)", color: "#d1495b", dash: "7 4", points: [Math.min(...xs), Math.max(...xs)].map((x) => ({ x, y: point.intercept + point.b * x })) }
  ];
}

function makeContributionChart(contributions: DunnAnalysisResult["contributions"], t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  return [
    { id: "capacitive-percent", label: t("cv.dunn.capacitive"), color: "#e07a5f", points: contributions.map((item) => ({ x: item.scanRate, y: item.capacitivePercent })) },
    { id: "diffusion-percent", label: t("cv.dunn.diffusion"), color: "#3d405b", dash: "5 3", points: contributions.map((item) => ({ x: item.scanRate, y: item.diffusionPercent })) }
  ];
}

function makeDunnChart(analysis: AnalysisState | null, original: CvSeries | undefined, contribution: DunnAnalysisResult["contributions"][number] | undefined, seriesIndex: number, t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  if (!analysis || !original || !contribution || seriesIndex < 0) return [];
  const points = (values: Array<number | null>) => analysis.grid.potentials.map((x, index) => ({ x, y: values[index] }));
  const reconstructedTotal = contribution.capacitiveCurrent.map((value, index) => value === null || contribution.diffusionCurrent[index] === null ? null : value + contribution.diffusionCurrent[index]!);
  return [
    { id: "original", label: t("cv.dunn.originalCurve"), color: "#16697a", points: original.points.map((point) => ({ x: point.potential, y: point.current })) },
    { id: "reconstructed-total", label: t("cv.dunn.reconstructedTotal"), color: "#2a9d8f", points: points(reconstructedTotal) },
    { id: "capacitive", label: t("cv.dunn.capacitive"), color: "#e07a5f", dash: "8 4", points: points(contribution.capacitiveCurrent) },
    { id: "diffusion", label: t("cv.dunn.diffusion"), color: "#3d405b", dash: "3 3", points: points(contribution.diffusionCurrent) }
  ];
}

function dunnRows(analysis: AnalysisState | null, contribution: DunnAnalysisResult["contributions"][number] | undefined, seriesIndex: number) {
  if (!analysis || !contribution || seriesIndex < 0) return [];
  return analysis.grid.potentials.map((potential, index) => {
    const capacitive = contribution.capacitiveCurrent[index];
    const diffusion = contribution.diffusionCurrent[index];
    return [potential, analysis.grid.currents[seriesIndex][index], capacitive === null || diffusion === null ? null : capacitive + diffusion, capacitive, diffusion];
  });
}

function sampleChartSeries(series: ChartSeries[]): ChartSeries[] {
  return series.map((item) => {
    const gaps = countNullRuns(item.points);
    if (item.mode !== "points" && gaps > MAX_CHART_GAP_RUNS) {
      return { ...item, mode: "points" as const, points: downsampleValidPoints(item.points, MAX_CHART_POINTS) };
    }
    return { ...item, points: downsamplePoints(item.points, MAX_CHART_POINTS) };
  });
}

function downsamplePoints<T extends { x: number; y: number | null }>(points: T[], limit: number): T[] {
  if (points.length <= limit) return points;
  const totalValid = points.reduce((total, point) => total + (point.y === null ? 0 : 1), 0);
  const sampled: T[] = [];
  let index = 0;
  while (index < points.length) {
    const isGap = points[index].y === null;
    const start = index;
    while (index < points.length && (points[index].y === null) === isGap) index += 1;
    const run = points.slice(start, index);
    if (isGap) sampled.push(run[Math.floor(run.length / 2)]);
    else {
      const allocation = Math.min(run.length, Math.max(Math.min(2, run.length), Math.floor(limit * run.length / Math.max(1, totalValid))));
      sampled.push(...downsampleValidPoints(run, allocation));
    }
  }
  return sampled.length <= MAX_CHART_OUTPUT_POINTS ? sampled : downsampleValidPoints(points, limit);
}

function downsampleValidPoints<T extends { x: number; y: number | null }>(points: T[], limit: number): T[] {
  const valid = points.filter((point) => point.y !== null);
  if (valid.length <= limit) return valid;
  if (limit <= 1) return [valid[0]];
  const sampled: T[] = [valid[0]];
  for (let bucket = 1; bucket < limit - 1; bucket += 1) {
    const start = Math.floor(bucket * valid.length / limit);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * valid.length / limit));
    const group = valid.slice(start, end);
    sampled.push(group.reduce((extreme, point) => Math.abs(point.y ?? 0) > Math.abs(extreme.y ?? 0) ? point : extreme));
  }
  sampled.push(valid[valid.length - 1]);
  return sampled;
}

function countNullRuns(points: Array<{ y: number | null }>) {
  let count = 0;
  let inside = false;
  for (const point of points) {
    if (point.y === null && !inside) { count += 1; inside = true; }
    else if (point.y !== null) inside = false;
  }
  return count;
}

function downsampleValues(values: number[], limit: number): number[] {
  if (values.length <= limit) return values;
  return Array.from({ length: limit }, (_, index) => values[Math.round(index * (values.length - 1) / (limit - 1))]);
}

function exportCsv(filename: typeof csvFiles[number], analysis: AnalysisState, t: ReturnType<typeof useI18n>["t"]) {
  const { grid, bValues, dunn } = analysis;
  const sortedContributions = [...dunn.contributions].sort((left, right) => left.scanRate - right.scanRate);
  let csv: string;
  const potentialHeader = `${t("cv.table.potential")} (V)`;
  const scanRateHeader = `${t("cv.table.scanRate")} (mV/s)`;
  if (filename === csvFiles[0]) csv = rowsToCsv([potentialHeader, ...grid.scanRates.map((rate) => t("cv.export.totalCurrentAt", { rate }))], grid.potentials.map((potential, index) => [potential, ...grid.currents.map((row) => row[index])]));
  else if (filename === csvFiles[1]) {
    const fits = new Map(bValues.map((point) => [point.potential, point]));
    csv = rowsToCsv([potentialHeader, t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.export.fitStatus")], grid.potentials.map((potential) => {
      const point = fits.get(potential);
      return point ? [potential, point.b, point.intercept, point.rSquared, point.pointCount, t("cv.export.available")] : [potential, null, null, null, null, t("cv.export.unavailable")];
    }));
  }
  else if (filename === csvFiles[2]) csv = rowsToCsv([potentialHeader, t("cv.dunn.k1"), t("cv.dunn.k2"), t("cv.results.rSquared"), t("cv.table.pointCount")], dunn.points.map((point) => [point.potential, point.k1, point.k2, point.rSquared, point.pointCount]));
  else if (filename === csvFiles[5]) csv = rowsToCsv([scanRateHeader, `${t("cv.dunn.capacitive")} (%)`, `${t("cv.dunn.diffusion")} (%)`], sortedContributions.map((item) => [item.scanRate, item.capacitivePercent, item.diffusionPercent]));
  else {
    const capacitive = filename === csvFiles[3];
    const headerKey = capacitive ? "cv.export.capacitiveCurrentAt" : "cv.export.diffusionCurrentAt";
    csv = rowsToCsv([potentialHeader, ...sortedContributions.map((item) => t(headerKey, { rate: item.scanRate }))], grid.potentials.map((potential, index) => [potential, ...sortedContributions.map((item) => (capacitive ? item.capacitiveCurrent : item.diffusionCurrent)[index])]));
  }
  downloadCsv(filename, csv);
}

function exportFigure(id: string, type: "svg" | "png") {
  const svg = document.querySelector<SVGSVGElement>(`svg[data-export-id="${id}"]`);
  if (!svg) throw new Error("chartUnavailable");
  return type === "svg" ? downloadSvg(svg, `${id}.svg`) : downloadPng(svg, `${id}.png`);
}
