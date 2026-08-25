import { useMemo, useRef, useState } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import {
  CvImportPanel,
  type CvImportDraft,
  type CvUiError
} from "../components/CvImportPanel";
import { ScientificLineChart, type ChartSeries } from "../components/ScientificLineChart";
import { useI18n } from "../i18n/I18nProvider";
import { parseScanRateList, type CvDataLayout, type CvHeaderMode } from "../lib/cvImport";
import { confirmCvSeries, CvParseError, parseCvFile, parseDelimitedCv, type ParsedCvTable } from "../lib/cvParsing";
import { analyzeCvWorkflow } from "../lib/cvWorkflow";
import { CvAnalysisError, type BValuePoint, type CvFitStatus, type CvSeries, type CvWorkflowResult, type DunnContribution } from "../lib/cvTypes";
import { downloadCsv, downloadPng, downloadSvg, rowsToCsv } from "../lib/toolExport";

type AnalysisState = CvWorkflowResult;
type ResultMetadata = {
  layout: CvDataLayout;
  headerMode: CvHeaderMode;
  source: CvImportDraft["source"];
  orderedScanRates: number[];
};

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
const initialDraft: CvImportDraft = {
  options: { layout: "", headerMode: "header" },
  source: "file",
  pasteText: "",
  scanRateText: "",
  pointInterval: 1,
  rSquaredThreshold: 0.95
};

export function CvKineticsPage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CvImportDraft>(initialDraft);
  const [table, setTable] = useState<ParsedCvTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [analysisMetadata, setAnalysisMetadata] = useState<ResultMetadata | null>(null);
  const [selectedPotential, setSelectedPotential] = useState<number | undefined>();
  const [potentialInput, setPotentialInput] = useState("");
  const [selectedRate, setSelectedRate] = useState<number | undefined>();
  const [errorCode, setErrorCode] = useState<CvUiError | null>(null);
  const importVersion = useRef(0);
  const bValues = (analysis?.bRecords ?? []).flatMap((record) => record.status === "valid" && record.fit ? [record.fit] : []);
  const contributions = analysis?.contributions ?? [];
  const canExportCsv = Boolean(analysis && analysisMetadata);

  function invalidateAnalysis() {
    setAnalysis(null);
    setAnalysisMetadata(null);
    setSelectedPotential(undefined);
    setPotentialInput("");
    setSelectedRate(undefined);
    setErrorCode(null);
  }

  function handleDraftChange(next: CvImportDraft) {
    const parsingChanged = next.options.layout !== draft.options.layout
      || next.options.headerMode !== draft.options.headerMode
      || next.source !== draft.source
      || next.pasteText !== draft.pasteText;
    importVersion.current += 1;
    setBusy(false);
    setDraft(next);
    if (parsingChanged) setTable(null);
    invalidateAnalysis();
  }

  async function importFile(file: File) {
    if (!draft.options.layout) {
      importVersion.current += 1;
      setTable(null);
      invalidateAnalysis();
      setErrorCode("formatRequired");
      return;
    }
    const version = ++importVersion.current;
    invalidateAnalysis();
    setTable(null);
    setDraft((current) => ({ ...current, scanRateText: "" }));
    setBusy(true);
    try {
      const parsed = await parseCvFile(file, {
        layout: draft.options.layout,
        headerMode: draft.options.headerMode
      });
      if (version !== importVersion.current) return;
      setTable(parsed);
      setDraft((current) => withInferredRates(current, parsed));
    } catch (error) {
      if (version !== importVersion.current) return;
      setTable(null);
      setErrorCode(error instanceof CvParseError ? error.code : "analysis");
    } finally {
      if (version === importVersion.current) setBusy(false);
    }
  }

  function parsePaste() {
    if (!draft.options.layout) {
      importVersion.current += 1;
      setTable(null);
      invalidateAnalysis();
      setErrorCode("formatRequired");
      return;
    }
    const version = ++importVersion.current;
    invalidateAnalysis();
    setTable(null);
    setDraft((current) => ({ ...current, scanRateText: "" }));
    setBusy(true);
    try {
      const parsed = parseDelimitedCv(draft.pasteText, {
        layout: draft.options.layout,
        headerMode: draft.options.headerMode
      });
      if (version !== importVersion.current) return;
      setTable(parsed);
      setDraft((current) => withInferredRates(current, parsed));
    } catch (error) {
      if (version !== importVersion.current) return;
      setErrorCode(error instanceof CvParseError ? error.code : "analysis");
    } finally {
      if (version === importVersion.current) setBusy(false);
    }
  }

  function handleCsvExport(filename: typeof csvFiles[number]) {
    if (!analysis || !analysisMetadata) return;
    setErrorCode(null);
    try { exportCsv(filename, analysis, analysisMetadata, t); }
    catch { setErrorCode("export"); }
  }

  async function handleFigureExport(id: string, type: "svg" | "png") {
    setErrorCode(null);
    try { await exportFigure(id, type); }
    catch { setErrorCode("export"); }
  }

  function runAnalysis() {
    if (!table) {
      setErrorCode("analysis");
      return;
    }
    setErrorCode(null);
    setAnalysis(null);
    try {
      const parsedRates = parseScanRateList(draft.scanRateText);
      const series = confirmCvSeries(table, parsedRates);
      const result = analyzeCvWorkflow(series, {
        pointInterval: draft.pointInterval,
        rSquaredThreshold: draft.rSquaredThreshold
      });
      const firstB = result.bRecords.find((record) => record.fit)?.fit;
      if (!firstB) throw new PageAnalysisError("noBFit");
      setAnalysis(result);
      setAnalysisMetadata({
        layout: table.layout,
        headerMode: table.headerMode,
        source: draft.source,
        orderedScanRates: [...parsedRates]
      });
      setSelectedPotential(firstB.potential);
      setPotentialInput(String(firstB.potential));
      setSelectedRate([...result.contributions].sort((left, right) => left.scanRate - right.scanRate)[0]?.scanRate);
    } catch (error) {
      if (error instanceof CvParseError) setErrorCode(error.code);
      else if (error instanceof PageAnalysisError) setErrorCode(error.code);
      else if (error instanceof CvAnalysisError && error.code === "noCommonPotentialRange") setErrorCode("noOverlap");
      else if (error instanceof CvAnalysisError && error.code === "invalidPointInterval") setErrorCode("invalidPointInterval");
      else if (error instanceof CvAnalysisError && error.code === "invalidRSquaredThreshold") setErrorCode("invalidRSquaredThreshold");
      else setErrorCode("analysis");
    }
  }

  const selectedBRecord = analysis?.bRecords.find((record) => record.potential === selectedPotential);
  const selectedB = selectedBRecord?.fit ?? undefined;
  const selectedContribution = contributions.find((item) => item.scanRate === selectedRate);
  const selectedSeriesIndex = analysis?.analysisGrid.scanRates.findIndex((rate) => rate === selectedRate) ?? -1;
  const selectedOriginalSeries = analysis?.series.find((item) => item.scanRate === selectedRate);
  const sortedContributions = [...contributions].sort((left, right) => left.scanRate - right.scanRate);
  const selectedPotentialIndex = analysis?.bRecords.findIndex((record) => record.potential === selectedPotential) ?? -1;
  const bChart = useMemo<ChartSeries[]>(() => analysis ? [{
    id: "b-values", label: t("cv.b.value"), color: "#16697a",
    points: analysis.bRecords.map((record) => ({
      x: record.potential,
      y: record.status === "valid" && record.fit ? record.fit.b : null
    }))
  }] : [], [analysis, t]);
  const fitChart = sampleChartSeries(makeFitChart(selectedB, t("cv.b.fitData")));
  const dunnChart = sampleChartSeries(makeDunnChart(analysis, selectedOriginalSeries, selectedContribution, selectedSeriesIndex, t));
  const contributionChart = sampleChartSeries(makeContributionChart(sortedContributions, t));
  const sampledBChart = useMemo(() => sampleChartSeries(bChart), [bChart]);
  const bGapRunCount = useMemo(() => countNullRuns(bChart[0]?.points ?? []), [bChart]);
  const missingBFitCount = analysis?.summary.unavailableBCount ?? 0;
  const resultMetadata = analysis ? analysisMetadata : null;
  const chartMetadata = analysis && resultMetadata
    ? [
      t("cv.chart.importSettings", {
        layout: layoutIdentifier(resultMetadata.layout),
        source: t(sourceKey(resultMetadata.source)),
        header: t(headerModeKey(resultMetadata.headerMode))
      }),
      t("cv.chart.analysisSettings", {
        rates: resultMetadata.orderedScanRates.map(serializeScientificNumber).join(", "),
        interval: analysis.settings.pointInterval,
        threshold: serializeScientificNumber(analysis.settings.rSquaredThreshold)
      })
    ]
    : undefined;
  const fitChartMetadata = chartMetadata && selectedBRecord
    ? [...chartMetadata, t("cv.chart.selectedPotential", { potential: serializeScientificNumber(selectedBRecord.potential) })]
    : chartMetadata;
  const dunnChartMetadata = chartMetadata && selectedRate !== undefined
    ? [...chartMetadata, t("cv.chart.selectedRate", { rate: serializeScientificNumber(selectedRate) })]
    : chartMetadata;
  const figureAvailability = {
    "cv-b-chart": hasChartPoints(sampledBChart),
    "cv-fit-chart": hasChartPoints(fitChart),
    "cv-dunn-chart": hasChartPoints(dunnChart),
    "cv-contribution-chart": hasChartPoints(contributionChart)
  } as const;

  function choosePotential(potential: number) {
    setSelectedPotential(potential);
    setPotentialInput(String(potential));
  }

  function handlePotentialInput(value: string) {
    setPotentialInput(value);
    const potential = value.trim() === "" ? Number.NaN : Number(value);
    const record = Number.isFinite(potential)
      ? analysis?.bRecords.find((item) => item.potential === potential)
      : undefined;
    setSelectedPotential(record?.potential);
  }

  function movePotential(offset: -1 | 1) {
    if (!analysis || selectedPotentialIndex < 0) return;
    const record = analysis.bRecords[selectedPotentialIndex + offset];
    if (record) choosePotential(record.potential);
  }

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
        <CvImportPanel
          draft={draft}
          table={table}
          busy={busy}
          error={errorCode}
          onDraftChange={handleDraftChange}
          onFile={(file) => void importFile(file)}
          onParsePaste={parsePaste}
          onAnalyze={runAnalysis}
        />

      {analysis && resultMetadata && <QualitySummary analysis={analysis} metadata={resultMetadata} />}

      <section className="tool-section cv-b-analysis">
        <h2>{t("cv.b.title")}</h2><p>{t("cv.b.help")}</p>
        <label htmlFor="cv-selected-potential">{t("cv.results.potential")} (V)</label>
        <input
          id="cv-selected-potential"
          name="selectedPotential"
          type="number"
          step="any"
          inputMode="decimal"
          aria-label={t("cv.aria.selectedPotential")}
          aria-invalid={potentialInput !== "" && selectedPotential === undefined}
          value={potentialInput}
          onChange={(event) => handlePotentialInput(event.target.value)}
        />
        <button type="button" disabled={selectedPotentialIndex <= 0} onClick={() => movePotential(-1)}>{t("cv.results.previousPotential")}</button>
        <button type="button" disabled={!analysis || selectedPotentialIndex < 0 || selectedPotentialIndex >= analysis.bRecords.length - 1} onClick={() => movePotential(1)}>{t("cv.results.nextPotential")}</button>
        <p>{t("cv.results.potentialHelp")}</p>
        {potentialInput !== "" && selectedPotential === undefined && <p role="status">{t("cv.results.potentialUnavailable")}</p>}
        {analysis && missingBFitCount > 0 && <p role="status">{t("cv.b.missingFits", { count: missingBFitCount, total: analysis.analysisGrid.potentials.length })}</p>}
        {bGapRunCount > MAX_CHART_GAP_RUNS && <p role="status">{t("cv.chart.tooManyGaps")}</p>}
        <ScientificLineChart title={t("cv.b.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.b.value")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={sampledBChart} selectedX={selectedPotential} onSelectX={choosePotential} exportId="cv-b-chart" metadata={chartMetadata} />
        <DataTable tableId="cv-b-records-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus")]}
          rows={(analysis?.bRecords ?? []).map((record) => bRecordRow(record, t))} />
        <ScientificLineChart title={t("cv.b.fitChart")} xLabel={t("cv.b.logRate")} yLabel={t("cv.b.logCurrent")}
          emptyLabel={t("cv.results.noFit")} legendLabel={t("cv.chart.legend")} series={fitChart} exportId="cv-fit-chart" metadata={fitChartMetadata} />
        {selectedBRecord && <p data-selected-fit-status="true">{t("cv.results.selectedFit", {
          status: fitStatusLabel(selectedBRecord.status, t),
          rSquared: selectedBRecord.fit ? format(selectedBRecord.fit.rSquared) : "—",
          points: selectedBRecord.fit ? selectedBRecord.fit.pointCount : "—"
        })}</p>}
        <DataTable tableId="cv-selected-b-record-table" headers={[t("cv.results.potential"), t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.results.points"), t("cv.results.fitStatus")]}
          rows={selectedBRecord ? [bRecordRow(selectedBRecord, t)] : []} />
      </section>

      <section className="tool-section cv-dunn-analysis">
        <h2>{t("cv.dunn.title")}</h2><p>{t("cv.dunn.help")}</p>
        <label>{t("cv.results.rate")} (mV/s)<select name="selectedRate" value={selectedRate ?? ""} onChange={(event) => setSelectedRate(Number(event.target.value))}>
          {sortedContributions.map((item) => <option key={item.scanRate} value={item.scanRate}>{item.scanRate}</option>)}
        </select></label>
        <ScientificLineChart title={t("cv.dunn.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.table.currentArbitrary")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={dunnChart} selectedX={selectedPotential} exportId="cv-dunn-chart" metadata={dunnChartMetadata} />
        <DataTable tableId="cv-original-current-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.originalMeasured")]}
          rows={(selectedOriginalSeries?.points ?? []).map((point) => [point.potential, point.current])} />
        <DataTable tableId="cv-dunn-current-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.interpolatedInput"), t("cv.dunn.reconstructedTotalUnits"), t("cv.dunn.capacitive") + " (arb. units)", t("cv.dunn.diffusion") + " (arb. units)"]}
          rows={dunnRows(analysis, selectedContribution, selectedSeriesIndex)} />
      </section>

      <section className="tool-section tool-section-wide cv-results">
        <h2>{t("cv.results.title")}</h2>
        <ScientificLineChart title={t("cv.dunn.contributionChart")} xLabel={`${t("cv.table.scanRate")} (mV/s)`} yLabel="%"
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={contributionChart} exportId="cv-contribution-chart" metadata={chartMetadata} />
        <DataTable tableId="cv-contribution-table" headers={[`${t("cv.table.scanRate")} (mV/s)`, t("cv.dunn.capacitive") + " (%)", t("cv.dunn.diffusion") + " (%)", t("cv.results.validSampledPoints"), `${t("cv.results.coverage")} (%)`]}
          rows={sortedContributions.map((item) => [item.scanRate, item.capacitivePercent, item.diffusionPercent, `${item.validPointCount} / ${item.sampledPointCount}`, item.coveragePercent])} />
        <p>{t("cv.results.contributionUnavailable")}</p>
        <DataTable tableId="cv-dunn-records-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.dunn.k1"), t("cv.dunn.k2"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus")]}
          rows={(analysis?.dunnRecords ?? []).map((record) => dunnRecordRow(record, t))} />
      </section>

      <section className="tool-section tool-section-wide cv-export">
        <h2>{t("cv.export.title")}</h2><h3>{t("cv.export.csv")}</h3>
        {csvFiles.map((filename) => <button key={filename} type="button" disabled={!canExportCsv} onClick={() => handleCsvExport(filename)}>{filename}</button>)}
        <h3>{t("cv.export.figures")}</h3>
        {(["cv-b-chart", "cv-fit-chart", "cv-dunn-chart", "cv-contribution-chart"] as const).flatMap((id) => [
          <button key={`${id}-svg`} type="button" disabled={!figureAvailability[id]} onClick={() => void handleFigureExport(id, "svg")}>{t("cv.export.svg")} — {id}.svg</button>,
          <button key={`${id}-png`} type="button" disabled={!figureAvailability[id]} onClick={() => void handleFigureExport(id, "png")}>{t("cv.export.png")} — {id}.png</button>
        ])}
      </section>
      </div>
    </section>
  );
}

export default CvKineticsPage;

class PageAnalysisError extends Error { constructor(readonly code: "noBFit" | "analysis") { super(code); } }

function DataTable({ headers, rows, tableId }: { headers: string[]; rows: Array<Array<string | number | null>>; tableId?: string }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  const displayedRows = rows.slice(0, MAX_TABLE_ROWS);
  return <div className="tool-table-wrap"><table data-table-id={tableId}><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead>
    <tbody>{displayedRows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{format(cell)}</td>)}</tr>)}</tbody></table>
    {rows.length > displayedRows.length && <p role="status">{t("cv.table.showingRows", { shown: displayedRows.length, total: rows.length })}</p>}</div>;
}

function QualitySummary({ analysis, metadata }: { analysis: AnalysisState; metadata: ResultMetadata }) {
  const { t } = useI18n();
  const minimum = analysis.fullGrid.potentials[0];
  const maximum = analysis.fullGrid.potentials.at(-1)!;
  const coverage = analysis.summary.retainedPointCount === 0
    ? 0
    : analysis.summary.validDunnCount / analysis.summary.retainedPointCount * 100;
  return <section className="tool-section tool-section-wide cv-quality" data-quality-summary="true">
    <h2>{t("cv.quality.title")}</h2>
    <ul>
      <li>{t("cv.quality.layout", { layout: layoutIdentifier(metadata.layout) })}</li>
      <li>{t("cv.quality.source", { source: t(sourceKey(metadata.source)) })}</li>
      <li>{t("cv.quality.curves", { count: analysis.series.length })}</li>
      <li>{t("cv.quality.rates", { rates: metadata.orderedScanRates.map((rate) => format(rate)).join(", ") })}</li>
      <li>{t("cv.quality.overlap", { minimum: format(minimum), maximum: format(maximum) })}</li>
      <li>{t("cv.quality.points", {
        common: analysis.summary.commonPointCount,
        retained: analysis.summary.retainedPointCount
      })}</li>
      <li>{t("cv.quality.settings", {
        interval: analysis.settings.pointInterval,
        threshold: format(analysis.settings.rSquaredThreshold)
      })}</li>
      <li>{t("cv.quality.bCounts", {
        valid: analysis.summary.validBCount,
        excluded: analysis.summary.excludedBCount,
        unavailable: analysis.summary.unavailableBCount
      })}</li>
      <li>{t("cv.quality.dunnCounts", {
        valid: analysis.summary.validDunnCount,
        excluded: analysis.summary.excludedDunnCount,
        unavailable: analysis.summary.unavailableDunnCount
      })}</li>
      <li>{t("cv.quality.coverage", {
        valid: analysis.summary.validDunnCount,
        total: analysis.summary.retainedPointCount,
        coverage: format(coverage)
      })}</li>
    </ul>
  </section>;
}

function bRecordRow(record: CvWorkflowResult["bRecords"][number], t: ReturnType<typeof useI18n>["t"]): Array<string | number | null> {
  return [
    record.potential,
    record.fit?.b ?? null,
    record.fit?.intercept ?? null,
    record.fit?.rSquared ?? null,
    record.fit?.pointCount ?? null,
    fitStatusLabel(record.status, t)
  ];
}

function dunnRecordRow(record: CvWorkflowResult["dunnRecords"][number], t: ReturnType<typeof useI18n>["t"]): Array<string | number | null> {
  return [
    record.potential,
    record.fit?.k1 ?? null,
    record.fit?.k2 ?? null,
    record.fit?.rSquared ?? null,
    record.fit?.pointCount ?? null,
    fitStatusLabel(record.status, t)
  ];
}

function fitStatusLabel(status: CvFitStatus, t: ReturnType<typeof useI18n>["t"]): string {
  const keys = {
    valid: "cv.status.valid",
    belowRSquaredThreshold: "cv.status.belowRSquaredThreshold",
    insufficientData: "cv.status.insufficientData",
    zeroCurrentLogUnavailable: "cv.status.zeroCurrentLogUnavailable",
    regressionFailed: "cv.status.regressionFailed"
  } as const;
  return t(keys[status]);
}

function layoutIdentifier(layout: CvDataLayout) {
  return layout === "sharedPotential" ? "XYYYYY" : "XYXYXY";
}

function sourceKey(source: CvImportDraft["source"]) {
  return source === "file" ? "cv.import.source.file" as const : "cv.import.source.paste" as const;
}

function headerModeKey(headerMode: CvHeaderMode) {
  return headerMode === "header" ? "cv.import.headerMode.header" as const : "cv.import.headerMode.data" as const;
}

function format(value: string | number | null) { return typeof value === "number" ? Number(value.toPrecision(7)).toString() : value ?? "—"; }

function serializeScientificNumber(value: number) { return String(value); }

function makeFitChart(point: BValuePoint | undefined, measuredLabel: string): ChartSeries[] {
  if (!point) return [];
  const fitPoints = [...point.fitPoints].sort((left, right) => left.logScanRate - right.logScanRate);
  const xs = fitPoints.map((item) => item.logScanRate);
  return [
    { id: "fit-points", label: measuredLabel, color: "#16697a", mode: "points", points: fitPoints.map((item) => ({ x: item.logScanRate, y: item.logCurrentMagnitude })) },
    { id: "fit-line", label: "log(|i|) = log(a) + b log(v)", color: "#d1495b", dash: "7 4", points: [Math.min(...xs), Math.max(...xs)].map((x) => ({ x, y: point.intercept + point.b * x })) }
  ];
}

function makeContributionChart(contributions: DunnContribution[], t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  return [
    { id: "capacitive-percent", label: t("cv.dunn.capacitive"), color: "#e07a5f", points: contributions.map((item) => ({ x: item.scanRate, y: item.capacitivePercent })) },
    { id: "diffusion-percent", label: t("cv.dunn.diffusion"), color: "#3d405b", dash: "5 3", points: contributions.map((item) => ({ x: item.scanRate, y: item.diffusionPercent })) }
  ];
}

function makeDunnChart(analysis: AnalysisState | null, original: CvSeries | undefined, contribution: DunnContribution | undefined, seriesIndex: number, t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  if (!analysis || !original || !contribution || seriesIndex < 0) return [];
  const points = (values: Array<number | null>) => analysis.analysisGrid.potentials.map((x, index) => ({ x, y: values[index] }));
  const reconstructedTotal = contribution.capacitiveCurrent.map((value, index) => value === null || contribution.diffusionCurrent[index] === null ? null : value + contribution.diffusionCurrent[index]!);
  return [
    { id: "original", label: t("cv.dunn.originalCurve"), color: "#16697a", points: original.points.map((point) => ({ x: point.potential, y: point.current })) },
    { id: "reconstructed-total", label: t("cv.dunn.reconstructedTotal"), color: "#2a9d8f", points: points(reconstructedTotal) },
    { id: "capacitive", label: t("cv.dunn.capacitive"), color: "#e07a5f", dash: "8 4", points: points(contribution.capacitiveCurrent) },
    { id: "diffusion", label: t("cv.dunn.diffusion"), color: "#3d405b", dash: "3 3", points: points(contribution.diffusionCurrent) }
  ];
}

function dunnRows(analysis: AnalysisState | null, contribution: DunnContribution | undefined, seriesIndex: number) {
  if (!analysis || !contribution || seriesIndex < 0) return [];
  return analysis.analysisGrid.potentials.map((potential, index) => {
    const capacitive = contribution.capacitiveCurrent[index];
    const diffusion = contribution.diffusionCurrent[index];
    return [potential, analysis.analysisGrid.currents[seriesIndex][index], capacitive === null || diffusion === null ? null : capacitive + diffusion, capacitive, diffusion];
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

function hasChartPoints(series: ChartSeries[]) {
  return series.some((item) => item.points.some((point) => point.y !== null));
}

function exportCsv(
  filename: typeof csvFiles[number],
  analysis: AnalysisState,
  metadata: ResultMetadata,
  t: ReturnType<typeof useI18n>["t"]
) {
  const grid = analysis.analysisGrid;
  const contributionByRate = new Map(analysis.contributions.map((item) => [item.scanRate, item]));
  const sortedRates = [...grid.scanRates].sort((left, right) => left - right);
  const metadataHeaders = [
    t("cv.export.dataLayout"),
    t("cv.export.dataSource"),
    t("cv.export.pointInterval"),
    t("cv.export.rSquaredThreshold"),
    t("cv.export.headerMode"),
    t("cv.export.orderedScanRates")
  ];
  const metadataValues = [
    layoutIdentifier(metadata.layout),
    t(sourceKey(metadata.source)),
    analysis.settings.pointInterval,
    analysis.settings.rSquaredThreshold,
    t(headerModeKey(metadata.headerMode)),
    metadata.orderedScanRates.map(serializeScientificNumber).join(" ")
  ];
  let csv: string;
  const potentialHeader = `${t("cv.table.potential")} (V)`;
  const scanRateHeader = `${t("cv.table.scanRate")} (mV/s)`;
  if (filename === csvFiles[0]) {
    const currentHeaders = grid.scanRates.map((rate) => t("cv.export.totalCurrentAt", { rate: serializeScientificNumber(rate) }));
    csv = rowsToCsv(
      [potentialHeader, ...withWideMetadata(currentHeaders, analysis, metadata, t)],
      grid.potentials.map((potential, index) => [potential, ...grid.currents.map((row) => row[index])])
    );
  }
  else if (filename === csvFiles[1]) csv = rowsToCsv(
    [potentialHeader, t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus"), ...metadataHeaders],
    analysis.bRecords.map((record) => [...bRecordRow(record, t), ...metadataValues])
  );
  else if (filename === csvFiles[2]) csv = rowsToCsv(
    [potentialHeader, t("cv.dunn.k1"), t("cv.dunn.k2"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus"), ...metadataHeaders],
    analysis.dunnRecords.map((record) => [...dunnRecordRow(record, t), ...metadataValues])
  );
  else if (filename === csvFiles[5]) {
    const validPointCount = analysis.summary.validDunnCount;
    const sampledPointCount = analysis.summary.retainedPointCount;
    const coverage = sampledPointCount === 0 ? 0 : validPointCount / sampledPointCount * 100;
    csv = rowsToCsv(
      [scanRateHeader, `${t("cv.dunn.capacitive")} (%)`, `${t("cv.dunn.diffusion")} (%)`, t("cv.export.validPoints"), t("cv.export.sampledPoints"), `${t("cv.results.coverage")} (%)`, t("cv.export.contributionStatus"), ...metadataHeaders],
      sortedRates.map((scanRate) => {
        const item = contributionByRate.get(scanRate);
        return [
          scanRate,
          item?.capacitivePercent ?? null,
          item?.diffusionPercent ?? null,
          validPointCount,
          sampledPointCount,
          coverage,
          item ? t("cv.export.available") : t("cv.export.unavailable"),
          ...metadataValues
        ];
      })
    );
  }
  else {
    const capacitive = filename === csvFiles[3];
    const headerKey = capacitive ? "cv.export.capacitiveCurrentAt" : "cv.export.diffusionCurrentAt";
    const currentHeaders = sortedRates.map((rate) => t(headerKey, { rate: serializeScientificNumber(rate) }));
    csv = rowsToCsv(
      [potentialHeader, ...withWideMetadata(currentHeaders, analysis, metadata, t)],
      grid.potentials.map((potential, index) => [potential, ...sortedRates.map((rate) => {
        const item = contributionByRate.get(rate);
        return item ? (capacitive ? item.capacitiveCurrent : item.diffusionCurrent)[index] : null;
      })])
    );
  }
  downloadCsv(filename, csv);
}

function withWideMetadata(
  headers: string[],
  analysis: AnalysisState,
  metadata: ResultMetadata,
  t: ReturnType<typeof useI18n>["t"]
) {
  if (headers.length === 0) return headers;
  const suffix = [
    `${t("cv.export.dataLayout")}: ${layoutIdentifier(metadata.layout)}`,
    `${t("cv.export.dataSource")}: ${t(sourceKey(metadata.source))}`,
    `${t("cv.export.headerMode")}: ${t(headerModeKey(metadata.headerMode))}`,
    `${t("cv.export.orderedScanRates")}: ${metadata.orderedScanRates.map(serializeScientificNumber).join(" ")}`,
    `${t("cv.export.pointInterval")}: ${analysis.settings.pointInterval}`,
    `${t("cv.export.rSquaredThreshold")}: ${serializeScientificNumber(analysis.settings.rSquaredThreshold)}`
  ].join("; ");
  return headers.map((header, index) => index === headers.length - 1 ? `${header} [${suffix}]` : header);
}

function withInferredRates(draft: CvImportDraft, table: ParsedCvTable): CvImportDraft {
  if (draft.scanRateText.trim() !== "") return draft;
  const inferred = table.currentColumns.map((column) => column.inferredScanRate);
  if (inferred.some((rate) => rate === null)) return draft;
  return { ...draft, scanRateText: inferred.join(", ") };
}

function exportFigure(id: string, type: "svg" | "png") {
  const svg = document.querySelector<SVGSVGElement>(`svg[data-export-id="${id}"]`);
  if (!svg) throw new Error("chartUnavailable");
  return type === "svg" ? downloadSvg(svg, `${id}.svg`) : downloadPng(svg, `${id}.png`);
}
