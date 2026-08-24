import { useRef, useState } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ScientificLineChart, type ChartSeries } from "../components/ScientificLineChart";
import { useI18n } from "../i18n/I18nProvider";
import { analyzeBValue, analyzeDunn, interpolateCommonGrid } from "../lib/cvAnalysis";
import { confirmCvSeries, CvParseError, parseCvFile, type CvParseErrorCode, type ParsedCvTable } from "../lib/cvParsing";
import type { BValuePoint, DunnAnalysisResult, InterpolatedCvData } from "../lib/cvTypes";
import { downloadCsv, downloadPng, downloadSvg, rowsToCsv } from "../lib/toolExport";

interface AnalysisState {
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
      setAnalysis({ grid, bValues, dunn });
      setSelectedPotential(bValues[0].potential);
      setSelectedRate(dunn.contributions[0].scanRate);
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
  const bChart: ChartSeries[] = analysis ? [{
    id: "b-values", label: t("cv.b.value"), color: "#16697a",
    points: analysis.bValues.map((point) => ({ x: point.potential, y: point.b }))
  }] : [];
  const fitChart = makeFitChart(selectedB, t("cv.b.fitData"));
  const dunnChart = makeDunnChart(analysis, selectedContribution, selectedSeriesIndex, t);
  const contributionChart = makeContributionChart(analysis, t);
  const missingBFitCount = analysis ? analysis.grid.potentials.length - analysis.bValues.length : 0;

  return (
    <section className="tools-page cv-page">
      <Breadcrumbs current={t("cv.title")} />
      <h1>{t("cv.title")}</h1>
      <p>{t("cv.subtitle")}</p>

      <section className="tool-section cv-import">
        <h2>{t("cv.import.title")}</h2>
        <p>{t("cv.import.help")}</p>
        <p>{t("cv.import.accepted")}</p>
        <label>{t("cv.upload")}<input aria-label={t("cv.aria.file")} type="file" accept=".csv,.txt,.xlsx" onChange={(event) => void importFile(event.currentTarget.files?.[0])} /></label>
        <p aria-live="polite" role={errorCode ? "alert" : undefined}>{errorCode ? errorMessage(errorCode, t) : ""}</p>
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
          {(analysis?.bValues ?? []).map((point) => <option key={point.potential} value={point.potential}>{point.potential}</option>)}
        </select></label>
        {analysis && missingBFitCount > 0 && <p role="status">{t("cv.b.missingFits", { count: missingBFitCount, total: analysis.grid.potentials.length })}</p>}
        <ScientificLineChart title={t("cv.b.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.b.value")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={bChart} selectedX={selectedPotential} onSelectX={setSelectedPotential} exportId="cv-b-chart" />
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
          {(analysis?.dunn.contributions ?? []).map((item) => <option key={item.scanRate} value={item.scanRate}>{item.scanRate}</option>)}
        </select></label>
        <ScientificLineChart title={t("cv.dunn.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.table.current")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={dunnChart} selectedX={selectedPotential} exportId="cv-dunn-chart" />
        <DataTable tableId="cv-dunn-current-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.measured"), t("cv.dunn.capacitive"), t("cv.dunn.diffusion")]}
          rows={dunnRows(analysis, selectedContribution, selectedSeriesIndex)} />
      </section>

      <section className="tool-section cv-results">
        <h2>{t("cv.results.title")}</h2>
        <ScientificLineChart title={t("cv.dunn.contributionChart")} xLabel={`${t("cv.table.scanRate")} (mV/s)`} yLabel="%"
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={contributionChart} exportId="cv-contribution-chart" />
        <DataTable tableId="cv-contribution-table" headers={[`${t("cv.table.scanRate")} (mV/s)`, t("cv.dunn.capacitive") + " (%)", t("cv.dunn.diffusion") + " (%)"]}
          rows={(analysis?.dunn.contributions ?? []).map((item) => [item.scanRate, item.capacitivePercent, item.diffusionPercent])} />
        <DataTable headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.k1"), t("cv.dunn.k2"), t("cv.results.rSquared"), t("cv.table.pointCount")]}
          rows={(analysis?.dunn.points ?? []).map((point) => [point.potential, point.k1, point.k2, point.rSquared, point.pointCount])} />
      </section>

      <section className="tool-section cv-export">
        <h2>{t("cv.export.title")}</h2><h3>{t("cv.export.csv")}</h3>
        {csvFiles.map((filename) => <button key={filename} type="button" disabled={!valid} onClick={() => handleCsvExport(filename)}>{filename}</button>)}
        <h3>{t("cv.export.figures")}</h3>
        {(["cv-b-chart", "cv-fit-chart", "cv-dunn-chart", "cv-contribution-chart"] as const).flatMap((id) => [
          <button key={`${id}-svg`} type="button" disabled={!valid} onClick={() => void handleFigureExport(id, "svg")}>{t("cv.export.svg")} — {id}.svg</button>,
          <button key={`${id}-png`} type="button" disabled={!valid} onClick={() => void handleFigureExport(id, "png")}>{t("cv.export.png")} — {id}.png</button>
        ])}
      </section>
    </section>
  );
}

class PageAnalysisError extends Error { constructor(readonly code: "noBFit" | "analysis") { super(code); } }

function errorMessage(code: CvParseErrorCode | "noOverlap" | "noBFit" | "analysis" | "export", t: ReturnType<typeof useI18n>["t"]) {
  const keys = {
    emptyFile: "cv.error.emptyFile", malformedFile: "cv.error.malformedFile", potentialColumnMissing: "cv.error.potentialColumnMissing",
    currentColumnsMissing: "cv.error.currentColumnsMissing", missingScanRate: "cv.error.missingScanRate", duplicateScanRate: "cv.error.duplicateScanRate",
    invalidScanRate: "cv.error.invalidScanRate", insufficientSeries: "cv.error.insufficientSeries", noOverlap: "cv.error.noOverlap",
    noBFit: "cv.error.noBFit", analysis: "cv.error.analysis", export: "cv.error.export"
  } as const;
  return t(keys[code]);
}

function DataTable({ headers, rows, tableId }: { headers: string[]; rows: Array<Array<string | number | null>>; tableId?: string }) {
  if (rows.length === 0) return null;
  return <div className="tool-table-wrap"><table data-table-id={tableId}><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{format(cell)}</td>)}</tr>)}</tbody></table></div>;
}

function format(value: string | number | null) { return typeof value === "number" ? Number(value.toPrecision(7)).toString() : value ?? "—"; }

function makeFitChart(point: BValuePoint | undefined, measuredLabel: string): ChartSeries[] {
  if (!point) return [];
  const xs = point.fitPoints.map((item) => item.logScanRate);
  return [
    { id: "fit-points", label: measuredLabel, color: "#16697a", points: point.fitPoints.map((item) => ({ x: item.logScanRate, y: item.logCurrentMagnitude })) },
    { id: "fit-line", label: "log(|i|) = log(a) + b log(v)", color: "#d1495b", dash: "7 4", points: [Math.min(...xs), Math.max(...xs)].map((x) => ({ x, y: point.intercept + point.b * x })) }
  ];
}

function makeContributionChart(analysis: AnalysisState | null, t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  if (!analysis) return [];
  return [
    { id: "capacitive-percent", label: t("cv.dunn.capacitive"), color: "#e07a5f", points: analysis.dunn.contributions.map((item) => ({ x: item.scanRate, y: item.capacitivePercent })) },
    { id: "diffusion-percent", label: t("cv.dunn.diffusion"), color: "#3d405b", dash: "5 3", points: analysis.dunn.contributions.map((item) => ({ x: item.scanRate, y: item.diffusionPercent })) }
  ];
}

function makeDunnChart(analysis: AnalysisState | null, contribution: DunnAnalysisResult["contributions"][number] | undefined, seriesIndex: number, t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  if (!analysis || !contribution || seriesIndex < 0) return [];
  const points = (values: Array<number | null>) => analysis.grid.potentials.flatMap((x, index) => values[index] === null ? [] : [{ x, y: values[index] as number }]);
  return [
    { id: "measured", label: t("cv.dunn.measured"), color: "#16697a", points: analysis.grid.potentials.map((x, index) => ({ x, y: analysis.grid.currents[seriesIndex][index] })) },
    { id: "capacitive", label: t("cv.dunn.capacitive"), color: "#e07a5f", dash: "8 4", points: points(contribution.capacitiveCurrent) },
    { id: "diffusion", label: t("cv.dunn.diffusion"), color: "#3d405b", dash: "3 3", points: points(contribution.diffusionCurrent) }
  ];
}

function dunnRows(analysis: AnalysisState | null, contribution: DunnAnalysisResult["contributions"][number] | undefined, seriesIndex: number) {
  if (!analysis || !contribution || seriesIndex < 0) return [];
  return analysis.grid.potentials.map((potential, index) => [potential, analysis.grid.currents[seriesIndex][index], contribution.capacitiveCurrent[index], contribution.diffusionCurrent[index]]);
}

function exportCsv(filename: typeof csvFiles[number], analysis: AnalysisState, t: ReturnType<typeof useI18n>["t"]) {
  const { grid, bValues, dunn } = analysis;
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
  else if (filename === csvFiles[5]) csv = rowsToCsv([scanRateHeader, `${t("cv.dunn.capacitive")} (%)`, `${t("cv.dunn.diffusion")} (%)`], dunn.contributions.map((item) => [item.scanRate, item.capacitivePercent, item.diffusionPercent]));
  else {
    const capacitive = filename === csvFiles[3];
    const headerKey = capacitive ? "cv.export.capacitiveCurrentAt" : "cv.export.diffusionCurrentAt";
    csv = rowsToCsv([potentialHeader, ...dunn.contributions.map((item) => t(headerKey, { rate: item.scanRate }))], grid.potentials.map((potential, index) => [potential, ...dunn.contributions.map((item) => (capacitive ? item.capacitiveCurrent : item.diffusionCurrent)[index])]));
  }
  downloadCsv(filename, csv);
}

function exportFigure(id: string, type: "svg" | "png") {
  const svg = document.querySelector<SVGSVGElement>(`svg[data-export-id="${id}"]`);
  if (!svg) throw new Error("chartUnavailable");
  return type === "svg" ? downloadSvg(svg, `${id}.svg`) : downloadPng(svg, `${id}.png`);
}
