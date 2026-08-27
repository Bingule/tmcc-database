import { useId, useMemo, useRef, useState } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import {
  CvImportPanel,
  type CvImportDraft,
  type CvUiError
} from "../components/CvImportPanel";
import { ScientificLineChart, type ChartAreaPoint, type ChartAreaSeries, type ChartSeries } from "../components/ScientificLineChart";
import { useI18n } from "../i18n/I18nProvider";
import { parseScanRateList, type CvDataLayout, type CvHeaderMode } from "../lib/cvImport";
import { confirmCvSeries, CvParseError, parseCvFile, parseDelimitedCv, type ParsedCvTable } from "../lib/cvParsing";
import { localCapacitiveFraction, rSquaredConfidence } from "../lib/cvDunnConfidence";
import { analyzeCvWorkflow } from "../lib/cvWorkflow";
import { CvAnalysisError, type BValuePoint, type CvAnalysisSettings, type CvFitRecord, type CvFitStatus, type CvSeries, type CvWorkflowResult, type DunnBranchFitRecord, type DunnContribution, type DunnFitStatus } from "../lib/cvTypes";
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
export const MAX_VISIBLE_TABLE_ROWS = 12;
const initialDraft: CvImportDraft = {
  options: { layout: "", headerMode: "header" },
  source: "file",
  pasteText: "",
  scanRateText: "",
  potentialIntervalMode: "auto",
  potentialIntervalMillivolts: 5,
  rSquaredThreshold: 0.95,
  dunnConfidenceMode: "threshold",
  turningPointTrimMode: "auto",
  turningPointTrimMillivolts: 0
};

export function CvKineticsPage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CvImportDraft>(initialDraft);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [table, setTable] = useState<ParsedCvTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [analysisMetadata, setAnalysisMetadata] = useState<ResultMetadata | null>(null);
  const [selectedBSequenceIndex, setSelectedBSequenceIndex] = useState<number | undefined>();
  const [potentialInput, setPotentialInput] = useState("");
  const [selectedRate, setSelectedRate] = useState<number | undefined>();
  const [errorCode, setErrorCode] = useState<CvUiError | null>(null);
  const importVersion = useRef(0);
  const bResultRecords = (analysis?.bRecords ?? []).filter(isResultOutputRecord);
  const dunnResultRecords = flattenDunnRecords(analysis).filter(isDunnResultOutputRecord);
  const validBResultRecords = bResultRecords.filter((record) => record.status === "valid" && record.fit);
  const contributions = analysis?.contributions ?? [];
  const canExportCsv = Boolean(analysis && analysisMetadata);

  function invalidateAnalysis() {
    setAnalysis(null);
    setAnalysisMetadata(null);
    setSelectedBSequenceIndex(undefined);
    setPotentialInput("");
    setSelectedRate(undefined);
    setErrorCode(null);
  }

  function handleDraftChange(next: CvImportDraft) {
    const fileSettingsChanged = next.options.layout !== draft.options.layout
      || next.options.headerMode !== draft.options.headerMode;
    const sourceChanged = next.source !== draft.source;
    const pasteChanged = next.pasteText !== draft.pasteText;
    const parsingChanged = fileSettingsChanged || sourceChanged || pasteChanged;
    importVersion.current += 1;
    setBusy(false);
    if (parsingChanged) setTable(null);
    setDraft(next);
    invalidateAnalysis();
    if (next.source === "file" && selectedFile && (fileSettingsChanged || sourceChanged)) {
      if (next.options.layout) void parseSelectedFile(selectedFile, {
        layout: next.options.layout,
        headerMode: next.options.headerMode
      });
      else setErrorCode("formatRequired");
    }
  }

  async function importFile(file: File) {
    setSelectedFile(file);
    setTable(null);
    invalidateAnalysis();
    if (!draft.options.layout) {
      importVersion.current += 1;
      setErrorCode("formatRequired");
      return;
    }
    await parseSelectedFile(file, {
      layout: draft.options.layout,
      headerMode: draft.options.headerMode
    });
  }

  async function parseSelectedFile(file: File, options: { layout: CvDataLayout; headerMode: CvHeaderMode }) {
    const version = ++importVersion.current;
    invalidateAnalysis();
    setTable(null);
    setDraft((current) => ({ ...current, scanRateText: "" }));
    setBusy(true);
    try {
      const parsed = await parseCvFile(file, {
        layout: options.layout,
        headerMode: options.headerMode
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
      const result = analyzeCvWorkflow(series, analysisSettingsFromDraft(draft));
      const firstAvailableB = result.bRecords.find((record) => record.fit)?.fit;
      if (!firstAvailableB) throw new PageAnalysisError("noBFit");
      const firstValidB = result.bRecords.find((record) => record.status === "valid" && record.fit);
      setAnalysis(result);
      setAnalysisMetadata({
        layout: table.layout,
        headerMode: table.headerMode,
        source: draft.source,
        orderedScanRates: [...parsedRates]
      });
      setSelectedBSequenceIndex(firstValidB?.sequenceIndex);
      setPotentialInput(firstValidB ? String(firstValidB.potential) : "");
      setSelectedRate([...result.analysisGrid.scanRates].sort((left, right) => left - right)[0]);
    } catch (error) {
      if (error instanceof CvParseError) setErrorCode(error.code);
      else if (error instanceof PageAnalysisError) setErrorCode(error.code);
      else if (error instanceof CvAnalysisError && error.code === "noCommonPotentialRange") setErrorCode("noOverlap");
      else if (error instanceof CvAnalysisError && error.code === "invalidCycleStructure") setErrorCode("invalidCycleStructure");
      else if (error instanceof CvAnalysisError && error.code === "invalidPotentialInterval") setErrorCode("invalidPotentialInterval");
      else if (error instanceof CvAnalysisError && error.code === "invalidTurningPointTrim") setErrorCode("invalidTurningPointTrim");
      else if (error instanceof CvAnalysisError && error.code === "invalidRSquaredThreshold") setErrorCode("invalidRSquaredThreshold");
      else setErrorCode("analysis");
    }
  }

  const selectedBRecord = validBResultRecords.find((record) => record.sequenceIndex === selectedBSequenceIndex);
  const selectedB = selectedBRecord?.fit ?? undefined;
  const selectedPotential = selectedBRecord?.potential;
  const requestedPotential = potentialInput.trim() === "" ? Number.NaN : Number(potentialInput);
  const selectedContribution = contributions.find((item) => item.scanRate === selectedRate);
  const selectedDunnPotential = Number.isFinite(requestedPotential) ? requestedPotential : undefined;
  const selectedSeriesIndex = analysis?.analysisGrid.scanRates.findIndex((rate) => rate === selectedRate) ?? -1;
  const selectedRawSeries = analysis?.series.find((item) => item.scanRate === selectedRate);
  const selectedCycle = selectedSeriesIndex >= 0 ? analysis?.alignedGrid.cycles[selectedSeriesIndex] : undefined;
  const selectedOriginalSeries: CvSeries | undefined = selectedRawSeries && selectedCycle
    ? { ...selectedRawSeries, points: selectedCycle.originalPoints }
    : undefined;
  const sortedContributions = [...contributions].sort((left, right) => left.scanRate - right.scanRate);
  const sortedDunnRates = [...(analysis?.analysisGrid.scanRates ?? [])].sort((left, right) => left - right);
  const dunnCoverage = analysis ? makeDunnCoverage(analysis) : undefined;
  const selectedBRecordIndex = validBResultRecords.findIndex((record) => record.sequenceIndex === selectedBSequenceIndex);
  const bChart = useMemo<ChartSeries[]>(() => {
    if (!analysis) return [];
    const bRecordBySequence = new Map(analysis.bRecords.map((record) => [record.sequenceIndex, record]));
    return [{
      id: "b-values", label: t("cv.b.value"), color: "#16697a",
      points: analysis.analysisGrid.potentials.map((potential, sequenceIndex) => {
        const record = bRecordBySequence.get(sequenceIndex);
        return {
          id: String(sequenceIndex),
          x: potential,
          y: record?.status === "valid" && record.fit ? record.fit.b : null,
          accessibilityLabel: `${t("cv.b.value")}: ${t("cv.table.potential")} ${serializeScientificNumber(potential)} V, ${t("cv.table.branchValue", { branch: (record?.branchIndex ?? 0) + 1 })}`
        };
      })
    }];
  }, [analysis, t]);
  const fitChart = sampleChartSeries(makeFitChart(selectedB, t("cv.b.fitData")));
  const dunnChart = sampleChartSeries(makeDunnChart(selectedOriginalSeries, selectedContribution, t));
  const dunnAreas = sampleChartAreas(makeDunnAreas(analysis, selectedRate, selectedSeriesIndex, t));
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
        interval: potentialIntervalLabel(analysis, t),
        threshold: serializeScientificNumber(analysis.settings.rSquaredThreshold)
      })
    ]
    : undefined;
  const fitChartMetadata = chartMetadata && selectedBRecord
    ? [...chartMetadata, t("cv.chart.selectedPotential", { potential: serializeScientificNumber(selectedBRecord.potential) })]
    : chartMetadata;
  const dunnChartMetadata = chartMetadata && selectedRate !== undefined
    ? [
      ...chartMetadata,
      t("cv.chart.selectedRate", { rate: serializeScientificNumber(selectedRate) }),
      ...(dunnCoverage ? [t("cv.dunn.coverageNotice", {
        valid: dunnCoverage.validPointCount,
        total: dunnCoverage.sampledPointCount,
        coverage: format(dunnCoverage.coveragePercent)
      })] : [])
    ]
    : chartMetadata;
  const figureAvailability = {
    "cv-b-chart": hasChartPoints(sampledBChart),
    "cv-fit-chart": hasChartPoints(fitChart),
    "cv-dunn-chart": hasChartPoints(dunnChart),
    "cv-contribution-chart": hasChartPoints(contributionChart)
  } as const;

  function choosePotential(potential: number) {
    const record = validBResultRecords.find((item) => item.potential === potential);
    setSelectedBSequenceIndex(record?.sequenceIndex);
    setPotentialInput(record ? String(record.potential) : String(potential));
  }

  function chooseBSequenceIndex(pointId: string) {
    const record = validBResultRecords.find((item) => String(item.sequenceIndex) === pointId);
    if (!record) return;
    setSelectedBSequenceIndex(record.sequenceIndex);
    setPotentialInput(String(record.potential));
  }

  function handlePotentialInput(value: string) {
    setPotentialInput(value);
    const potential = value.trim() === "" ? Number.NaN : Number(value);
    const record = Number.isFinite(potential)
      ? validBResultRecords.find((item) => item.potential === potential)
      : undefined;
    setSelectedBSequenceIndex(record?.sequenceIndex);
  }

  function movePotential(offset: -1 | 1) {
    if (!analysis || selectedBRecordIndex < 0) return;
    const record = validBResultRecords[selectedBRecordIndex + offset];
    if (!record) return;
    setSelectedBSequenceIndex(record.sequenceIndex);
    setPotentialInput(String(record.potential));
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

      <div className="tool-layout cv-tool-layout">
        <CvImportPanel
          draft={draft}
          table={table}
          selectedFileName={selectedFile?.name ?? null}
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
        <button type="button" disabled={selectedBRecordIndex <= 0} onClick={() => movePotential(-1)}>{t("cv.results.previousPotential")}</button>
        <button type="button" disabled={!analysis || selectedBRecordIndex < 0 || selectedBRecordIndex >= validBResultRecords.length - 1} onClick={() => movePotential(1)}>{t("cv.results.nextPotential")}</button>
        <p>{t("cv.results.potentialHelp")}</p>
        {potentialInput !== "" && selectedPotential === undefined && <p role="status">{t("cv.results.potentialUnavailable")}</p>}
        {analysis && missingBFitCount > 0 && <p role="status">{t("cv.b.missingFits", { count: missingBFitCount, total: analysis.analysisGrid.potentials.length })}</p>}
        {bGapRunCount > MAX_CHART_GAP_RUNS && <p role="status">{t("cv.chart.tooManyGaps")}</p>}
        <ScientificLineChart title={t("cv.b.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.b.value")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={sampledBChart}
          selectedPointId={selectedBSequenceIndex === undefined ? undefined : String(selectedBSequenceIndex)} onSelectPointId={chooseBSequenceIndex}
          exportId="cv-b-chart" metadata={chartMetadata} />
        <DataTable tableId="cv-b-records-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.table.sweepBranch"), t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus")]}
          rows={bResultRecords.map((record) => bRecordRow(record, t))} />
        <ScientificLineChart title={t("cv.b.fitChart")} xLabel={t("cv.b.logRate")} yLabel={t("cv.b.logCurrent")}
          emptyLabel={t("cv.results.noFit")} legendLabel={t("cv.chart.legend")} series={fitChart} exportId="cv-fit-chart" metadata={fitChartMetadata} />
        {selectedBRecord && <p data-selected-fit-status="true">{t("cv.results.selectedFit", {
          status: fitStatusLabel(selectedBRecord.status, t),
          rSquared: selectedBRecord.fit ? format(selectedBRecord.fit.rSquared) : "—",
          points: selectedBRecord.fit ? selectedBRecord.fit.pointCount : "—"
        })}</p>}
        <DataTable tableId="cv-selected-b-record-table" headers={[t("cv.results.potential"), t("cv.table.sweepBranch"), t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.results.points"), t("cv.results.fitStatus")]}
          rows={selectedBRecord ? [bRecordRow(selectedBRecord, t)] : []} />
      </section>

      <section className="tool-section cv-dunn-analysis">
        <h2>{t("cv.dunn.title")}</h2><p>{t("cv.dunn.help")}</p>
        <label>{t("cv.results.rate")} (mV/s)<select name="selectedRate" value={selectedRate ?? ""} onChange={(event) => setSelectedRate(Number(event.target.value))}>
          {sortedDunnRates.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
        </select></label>
        {dunnCoverage && <>
          <p className="cv-dunn-coverage" data-dunn-coverage="true">{t("cv.dunn.coverageNotice", {
            valid: dunnCoverage.validPointCount,
            total: dunnCoverage.sampledPointCount,
            coverage: format(dunnCoverage.coveragePercent)
          })}</p>
          <p className="cv-dunn-coverage-help">{t("cv.dunn.coverageHelp")}</p>
        </>}
        <ScientificLineChart title={t("cv.dunn.chart")} xLabel={`${t("cv.table.potential")} (V)`} yLabel={t("cv.table.currentArbitrary")}
          emptyLabel={t("cv.chart.empty")} legendLabel={t("cv.chart.legend")} series={dunnChart} areas={dunnAreas} selectedX={selectedDunnPotential} exportId="cv-dunn-chart" metadata={dunnChartMetadata} />
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
          rows={sortedContributions.map((item) => [
            item.scanRate,
            item.capacitivePercent,
            item.diffusionPercent,
            `${dunnCoverage?.validPointCount ?? 0} / ${dunnCoverage?.sampledPointCount ?? 0}`,
            dunnCoverage?.coveragePercent ?? 0
          ])} />
        <p>{t("cv.results.contributionUnavailable")}</p>
        <DataTable tableId="cv-dunn-records-table" headers={[`${t("cv.table.potential")} (V)`, t("cv.table.sweepBranch"), t("cv.dunn.k1"), t("cv.dunn.k2"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus")]}
          rows={dunnResultRecords.map((record) => dunnRecordRow(record, t))} />
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
  const controlId = useId();
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(() => new Set());
  const [copyStatus, setCopyStatus] = useState<"success" | "error" | null>(null);
  const supportsColumnCopy = rows.length > 1;

  function toggleColumn(index: number) {
    setSelectedColumns((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setCopyStatus(null);
  }

  async function copySelectedColumns() {
    const indices = headers.map((_, index) => index)
      .filter((index) => selectedColumns.has(index));
    if (indices.length === 0) return;
    const text = [headers, ...rows]
      .map((row) => indices.map((index) => format(row[index] ?? null)).join("\t"))
      .join("\r\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  if (rows.length === 0) return null;
  const displayedRows = rows.slice(0, MAX_TABLE_ROWS);
  const scrollsVertically = displayedRows.length > MAX_VISIBLE_TABLE_ROWS;
  return <div className="cv-result-table-block">
    {supportsColumnCopy && <div className="cv-table-copy-toolbar">
      <span id={`${controlId}-columns`}>{t("cv.table.copy.columns")}</span>
      <div className="cv-table-copy-columns" role="group" aria-labelledby={`${controlId}-columns`}>
        {headers.map((header, index) => {
          const checkboxId = `${controlId}-column-${index}`;
          return <label htmlFor={checkboxId} key={index}>
            <input id={checkboxId} type="checkbox" value={index} checked={selectedColumns.has(index)} onChange={() => toggleColumn(index)} />
            {header}
          </label>;
        })}
      </div>
      <button type="button" disabled={selectedColumns.size === 0} onClick={copySelectedColumns}>{t("cv.table.copy.action")}</button>
      <p role="status" aria-live="polite">{copyStatus && t(`cv.table.copy.${copyStatus}`)}</p>
    </div>}
    <div className={`cv-result-table-frame${scrollsVertically ? " cv-result-table-frame-scroll" : ""}`}>
      <div className="tool-table-wrap">
        <div className="cv-result-table-viewport">
          <table data-table-id={tableId}><thead><tr>{headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
            <tbody>{displayedRows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{format(cell)}</td>)}</tr>)}</tbody></table>
        </div>
      </div>
    </div>
    {rows.length > displayedRows.length && <p role="status">{t("cv.table.showingRows", { shown: displayedRows.length, total: rows.length })}</p>}
  </div>;
}

function QualitySummary({ analysis, metadata }: { analysis: AnalysisState; metadata: ResultMetadata }) {
  const { t } = useI18n();
  const minimum = analysis.alignedGrid.commonMinimum;
  const maximum = analysis.alignedGrid.commonMaximum;
  const diagnostics = analysis.contributions[0]?.diagnostics;
  const dunnCoverage = makeDunnCoverage(analysis);
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
        interval: potentialIntervalLabel(analysis, t),
        method: dunnMethodLabel(analysis.settings.dunnConfidenceMode, t),
        trim: turningPointTrimLabel(analysis, t),
        smoothing: t("cv.quality.smoothing.auto"),
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
        valid: dunnCoverage.validPointCount,
        total: dunnCoverage.sampledPointCount,
        coverage: format(dunnCoverage.coveragePercent)
      })}</li>
    </ul>
    {diagnostics && <div className="cv-diagnostics" data-dunn-diagnostics="true">
      <h3>{t("cv.diagnostics.title")}</h3>
      <dl className="cv-diagnostics-list">
        <dt>{t("cv.diagnostics.mode")}</dt>
        <dd>{dunnMethodLabel(diagnostics.mode, t)}</dd>
        <dt>{t("cv.diagnostics.interval")}</dt>
        <dd>{format(diagnostics.resolvedPotentialInterval * 1000)} mV</dd>
        <dt>{t("cv.diagnostics.trim")}</dt>
        <dd>{format(diagnostics.resolvedTurningPointTrim * 1000)} mV</dd>
        <dt>{t("cv.diagnostics.forwardMedian")}</dt>
        <dd>{format(diagnostics.medianForwardRSquared)}</dd>
        <dt>{t("cv.diagnostics.reverseMedian")}</dt>
        <dd>{format(diagnostics.medianReverseRSquared)}</dd>
        <dt>{t("cv.diagnostics.forwardAbove")}</dt>
        <dd>{format(diagnostics.forwardAboveThresholdPercent)}%</dd>
        <dt>{t("cv.diagnostics.reverseAbove")}</dt>
        <dd>{format(diagnostics.reverseAboveThresholdPercent)}%</dd>
      </dl>
      {diagnostics.lowFitQuality && <p className="cv-diagnostic-warning" role="status">{t("cv.warning.lowFitQuality")}</p>}
      {diagnostics.scanRateWarning && <p className="cv-diagnostic-warning" role="status">{t("cv.warning.scanRateCount")}</p>}
    </div>}
  </section>;
}

function bRecordRow(record: CvWorkflowResult["bRecords"][number], t: ReturnType<typeof useI18n>["t"]): Array<string | number | null> {
  return [
    record.potential,
    t("cv.table.branchValue", { branch: record.branchIndex + 1 }),
    record.fit?.b ?? null,
    record.fit?.intercept ?? null,
    record.fit?.rSquared ?? null,
    record.fit?.pointCount ?? null,
    fitStatusLabel(record.status, t)
  ];
}

function isResultOutputRecord<T>(record: CvFitRecord<T>) {
  return record.status !== "belowRSquaredThreshold";
}

function isDunnResultOutputRecord(record: DunnBranchFitRecord) {
  return record.status !== "belowRSquaredThreshold";
}

function dunnRecordRow(record: DunnBranchFitRecord, t: ReturnType<typeof useI18n>["t"]): Array<string | number | null> {
  return [
    record.potential,
    t("cv.table.branchValue", { branch: record.branch === "forward" ? 1 : 2 }),
    record.fit?.k1 ?? null,
    record.fit?.k2 ?? null,
    record.fit?.rSquared ?? null,
    record.fit?.pointCount ?? null,
    fitStatusLabel(record.status, t)
  ];
}

function fitStatusLabel(status: CvFitStatus | DunnFitStatus, t: ReturnType<typeof useI18n>["t"]): string {
  const keys = {
    valid: "cv.status.valid",
    belowRSquaredThreshold: "cv.status.belowRSquaredThreshold",
    insufficientData: "cv.status.insufficientData",
    zeroCurrentLogUnavailable: "cv.status.zeroCurrentLogUnavailable",
    regressionFailed: "cv.status.regressionFailed",
    trimmed: "cv.status.trimmed"
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

function flattenDunnRecords(analysis: AnalysisState | null): DunnBranchFitRecord[] {
  return analysis ? [...analysis.dunnRecords.forward, ...analysis.dunnRecords.reverse] : [];
}

function potentialIntervalLabel(analysis: AnalysisState, t: ReturnType<typeof useI18n>["t"]): string {
  return analysis.settings.potentialInterval.mode === "manual"
    ? `${serializeScientificNumber(analysis.settings.potentialInterval.millivolts)} mV`
    : t("cv.import.mode.auto");
}

function resolvedPotentialIntervalLabel(analysis: AnalysisState): string {
  return `${serializeScientificNumber(analysis.alignedGrid.resolvedPotentialInterval * 1000)} mV`;
}

function turningPointTrimLabel(analysis: AnalysisState, t: ReturnType<typeof useI18n>["t"]): string {
  return analysis.settings.turningPointTrim.mode === "manual"
    ? `${serializeScientificNumber(analysis.settings.turningPointTrim.millivolts)} mV`
    : t("cv.import.mode.auto");
}

function dunnMethodLabel(mode: CvAnalysisSettings["dunnConfidenceMode"], t: ReturnType<typeof useI18n>["t"]): string {
  return mode === "weighted" ? t("cv.import.dunnMethod.weighted") : t("cv.import.dunnMethod.threshold");
}

function analysisSettingsFromDraft(draft: CvImportDraft): CvAnalysisSettings {
  return {
    potentialInterval: draft.potentialIntervalMode === "manual"
      ? { mode: "manual", millivolts: draft.potentialIntervalMillivolts }
      : { mode: "auto" },
    rSquaredThreshold: draft.rSquaredThreshold,
    dunnConfidenceMode: draft.dunnConfidenceMode,
    turningPointTrim: draft.turningPointTrimMode === "manual"
      ? { mode: "manual", millivolts: draft.turningPointTrimMillivolts }
      : { mode: "auto" }
  };
}

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

function makeDunnChart(
  original: CvSeries | undefined,
  contribution: DunnContribution | undefined,
  t: ReturnType<typeof useI18n>["t"]
): ChartSeries[] {
  if (!original) return [];
  const series: ChartSeries[] = [{
    id: "original",
    label: t("cv.dunn.originalCurve"),
    color: "#16697a",
    points: original.points.map((point) => ({ x: point.potential, y: point.current }))
  }];
  if (!contribution) return series;

  series.push({
    id: "capacitive-forward",
    label: `${t("cv.dunn.capacitive")} ${t("cv.table.branchValue", { branch: 1 })}`,
    color: "#7656a8",
    dash: "4 3",
    points: makeBranchBoundaryPoints(contribution.plotPath, "forward")
  });
  series.push({
    id: "capacitive-reverse",
    label: `${t("cv.dunn.capacitive")} ${t("cv.table.branchValue", { branch: 2 })}`,
    color: "#9a78cf",
    dash: "4 3",
    points: makeBranchBoundaryPoints(contribution.plotPath, "reverse")
  });
  return series;
}

function makeBranchBoundaryPoints(
  plotPath: DunnContribution["plotPath"],
  branch: DunnContribution["plotPath"][number]["branch"]
): ChartSeries["points"] {
  const points: ChartSeries["points"] = [];
  let insideRun = false;
  for (let index = 0; index < plotPath.length; index += 1) {
    const point = plotPath[index]!;
    if (point.branch !== branch) {
      insideRun = false;
      continue;
    }
    if (!insideRun && index > 0) {
      if (points.length > 0) points.push({ x: point.potential, y: null });
      const sharedTurningPoint = plotPath[index - 1]!;
      points.push({ x: sharedTurningPoint.potential, y: sharedTurningPoint.current });
    }
    points.push({ x: point.potential, y: point.current });
    insideRun = true;
  }
  return points;
}

function makeDunnAreas(
  analysis: AnalysisState | null,
  scanRate: number | undefined,
  seriesIndex: number,
  t: ReturnType<typeof useI18n>["t"]
): ChartAreaSeries[] {
  if (!analysis || scanRate === undefined || seriesIndex < 0) return [];
  const contribution = analysis.contributions.find((item) => item.scanRate === scanRate);
  if (!contribution) return [];
  const toAreaPoint = (x: number, first: number, second: number): ChartAreaPoint => ({
    x,
    lower: Math.min(first, second),
    upper: Math.max(first, second)
  });

  return [{
    id: "capacitive-area",
    label: t("cv.dunn.capacitive"),
    color: "#7656a8",
    opacity: 0.72,
    segments: [contribution.potentialGrid.map((potential, index) =>
      toAreaPoint(potential, contribution.capacitiveForward[index]!, contribution.capacitiveReverse[index]!))]
  }, {
    id: "diffusion-area",
    label: t("cv.dunn.diffusion"),
    color: "#6fb7a7",
    opacity: 0.72,
    segments: [
      contribution.potentialGrid.map((potential, index) =>
        toAreaPoint(potential, contribution.originalForward[index]!, contribution.capacitiveForward[index]!)),
      contribution.potentialGrid.map((potential, index) =>
        toAreaPoint(potential, contribution.originalReverse[index]!, contribution.capacitiveReverse[index]!))
    ]
  }];
}

function makeDunnCoverage(analysis: AnalysisState) {
  const dunnRecords = flattenDunnRecords(analysis);
  const validPointCount = dunnRecords.filter((record) => record.status === "valid" && record.fit).length;
  const sampledPointCount = dunnRecords.length;
  return {
    validPointCount,
    sampledPointCount,
    coveragePercent: sampledPointCount === 0 ? 0 : 100 * validPointCount / sampledPointCount
  };
}

function collectAreaSegments(
  startIndex: number,
  endIndex: number,
  makePoint: (index: number) => ChartAreaPoint | null
): ChartAreaPoint[][] {
  const segments: ChartAreaPoint[][] = [];
  let current: ChartAreaPoint[] = [];
  const flush = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  for (let index = startIndex; index <= endIndex; index += 1) {
    const point = makePoint(index);
    if (point) current.push(point);
    else flush();
  }
  flush();
  return segments;
}

function dunnRows(analysis: AnalysisState | null, contribution: DunnContribution | undefined, seriesIndex: number) {
  if (!analysis || !contribution || seriesIndex < 0) return [];
  const forwardRows = contribution.potentialGrid.map((potential, index) => {
    const capacitive = contribution.capacitiveForward[index];
    const diffusion = contribution.diffusionForward[index];
    return [potential, contribution.originalForward[index], capacitive + diffusion, capacitive, diffusion];
  });
  const reverseRows = contribution.potentialGrid.map((potential, index) => {
    const capacitive = contribution.capacitiveReverse[index];
    const diffusion = contribution.diffusionReverse[index];
    return [potential, contribution.originalReverse[index], capacitive + diffusion, capacitive, diffusion];
  });
  return [...forwardRows, ...reverseRows];
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

function sampleChartAreas(areas: ChartAreaSeries[]): ChartAreaSeries[] {
  return areas.map((area) => ({
    ...area,
    segments: downsampleAreaSegments(area.segments, MAX_CHART_OUTPUT_POINTS)
  }));
}

function downsampleAreaSegments(segments: ChartAreaPoint[][], limit: number): ChartAreaPoint[][] {
  const drawable = segments.filter((segment) => segment.length >= 2);
  const totalPointCount = drawable.reduce((total, segment) => total + segment.length, 0);
  if (totalPointCount <= limit) return drawable;

  const maximumSegmentCount = Math.max(1, Math.floor(limit / 2));
  const selected = drawable.length <= maximumSegmentCount
    ? drawable
    : selectEvenlySpacedSegments(drawable, maximumSegmentCount);
  const allocations = selected.map(() => 2);
  let remaining = limit - allocations.length * 2;
  const extraCapacity = selected.map((segment) => segment.length - 2);
  const totalExtraCapacity = extraCapacity.reduce((total, count) => total + count, 0);

  if (remaining > 0 && totalExtraCapacity > 0) {
    for (let index = 0; index < selected.length; index += 1) {
      const extra = Math.min(extraCapacity[index], Math.floor(remaining * extraCapacity[index] / totalExtraCapacity));
      allocations[index] += extra;
    }
    remaining = limit - allocations.reduce((total, count) => total + count, 0);
    for (let index = 0; remaining > 0; index = (index + 1) % selected.length) {
      if (allocations[index] >= selected[index].length) continue;
      allocations[index] += 1;
      remaining -= 1;
    }
  }

  return selected.map((segment, index) => downsampleAreaSegment(segment, allocations[index]));
}

function selectEvenlySpacedSegments<T>(segments: T[], limit: number): T[] {
  if (segments.length <= limit) return segments;
  if (limit <= 1) return [segments[0]];
  return Array.from({ length: limit }, (_, index) =>
    segments[Math.round(index * (segments.length - 1) / (limit - 1))]);
}

function downsampleAreaSegment(points: ChartAreaPoint[], limit: number): ChartAreaPoint[] {
  if (points.length <= limit) return points;
  if (limit <= 2) return [points[0], points[points.length - 1]];
  const interiorCount = points.length - 2;
  const interiorTarget = limit - 2;
  const sampled = [points[0]];
  for (let bucket = 0; bucket < interiorTarget; bucket += 1) {
    const start = 1 + Math.floor(bucket * interiorCount / interiorTarget);
    const end = 1 + Math.max(start, Math.floor((bucket + 1) * interiorCount / interiorTarget));
    const group = points.slice(start, Math.min(points.length - 1, end));
    sampled.push(group.reduce((extreme, point) => areaPointMagnitude(point) > areaPointMagnitude(extreme) ? point : extreme));
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

function areaPointMagnitude(point: ChartAreaPoint) {
  const lower = typeof point.lower === "number" ? point.lower : 0;
  const upper = typeof point.upper === "number" ? point.upper : 0;
  return Math.max(Math.abs(lower), Math.abs(upper), Math.abs(upper - lower));
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
  const metadataHeaders = exportMetadataHeaders(t);
  const metadataValues = exportMetadataValues(analysis, metadata, t);
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
    [potentialHeader, t("cv.table.sweepBranch"), t("cv.b.value"), t("cv.b.intercept"), t("cv.results.rSquared"), t("cv.table.pointCount"), t("cv.results.fitStatus"), ...metadataHeaders],
    analysis.bRecords.filter(isResultOutputRecord).map((record) => [...bRecordRow(record, t), ...metadataValues])
  );
  else if (filename === csvFiles[2]) csv = rowsToCsv(
    [
      scanRateHeader,
      potentialHeader,
      t("cv.table.sweepBranch"),
      t("cv.dunn.k1"),
      t("cv.dunn.k2"),
      t("cv.results.rSquared"),
      t("cv.table.pointCount"),
      t("cv.results.fitStatus"),
      t("cv.export.localCapacitiveFraction"),
      t("cv.export.localConfidence"),
      ...metadataHeaders
    ],
    dunnExportRows(analysis, sortedRates, t).map((row) => [...row, ...metadataValues])
  );
  else if (filename === csvFiles[5]) {
    const dunnCoverage = makeDunnCoverage(analysis);
    csv = rowsToCsv(
      [scanRateHeader, `${t("cv.dunn.capacitive")} (%)`, `${t("cv.dunn.diffusion")} (%)`, t("cv.export.validPoints"), t("cv.export.sampledPoints"), `${t("cv.results.coverage")} (%)`, t("cv.export.contributionStatus"), ...metadataHeaders],
      sortedRates.map((scanRate) => {
        const item = contributionByRate.get(scanRate);
        return [
          scanRate,
          item?.capacitivePercent ?? null,
          item?.diffusionPercent ?? null,
          dunnCoverage.validPointCount,
          dunnCoverage.sampledPointCount,
          dunnCoverage.coveragePercent,
          item ? t("cv.export.available") : t("cv.export.unavailable"),
          ...metadataValues
        ];
      })
    );
  }
  else {
    const capacitive = filename === csvFiles[3];
    const forwardHeaderKey = capacitive
      ? "cv.export.capacitiveCurrentAtForward"
      : "cv.export.diffusionCurrentAtForward";
    const reverseHeaderKey = capacitive
      ? "cv.export.capacitiveCurrentAtReverse"
      : "cv.export.diffusionCurrentAtReverse";
    const currentHeaders = sortedRates.flatMap((rate) => [
      t("cv.export.gAt", { rate: serializeScientificNumber(rate) }),
      t(forwardHeaderKey, { rate: serializeScientificNumber(rate) }),
      t(reverseHeaderKey, { rate: serializeScientificNumber(rate) })
    ]);
    csv = rowsToCsv(
      [potentialHeader, ...withWideMetadata(currentHeaders, analysis, metadata, t)],
      analysis.alignedGrid.potentials.map((potential, index) => [potential, ...sortedRates.map((rate) => {
        const item = contributionByRate.get(rate);
        const forward = item ? (capacitive ? item.capacitiveForward : item.diffusionForward)[index] : null;
        const reverse = item ? (capacitive ? item.capacitiveReverse : item.diffusionReverse)[index] : null;
        return [item?.g[index] ?? null, forward, reverse];
      }).flat()])
    );
  }
  downloadCsv(filename, csv);
}

function exportMetadataHeaders(t: ReturnType<typeof useI18n>["t"]) {
  return [
    t("cv.export.dataLayout"),
    t("cv.export.dataSource"),
    t("cv.export.requestedInterval"),
    t("cv.export.resolvedInterval"),
    t("cv.export.dunnMethod"),
    t("cv.export.rSquaredThreshold"),
    t("cv.export.requestedTurningTrim"),
    t("cv.export.resolvedTurningTrim"),
    t("cv.export.smoothing"),
    t("cv.export.commonRange"),
    t("cv.export.forwardMedianRSquared"),
    t("cv.export.reverseMedianRSquared"),
    t("cv.export.dunnCoverage"),
    t("cv.export.headerMode"),
    t("cv.export.orderedScanRates")
  ];
}

function exportMetadataValues(
  analysis: AnalysisState,
  metadata: ResultMetadata,
  t: ReturnType<typeof useI18n>["t"]
) {
  const diagnostics = analysis.contributions[0]?.diagnostics;
  const dunnCoverage = makeDunnCoverage(analysis);
  return [
    layoutIdentifier(metadata.layout),
    t(sourceKey(metadata.source)),
    potentialIntervalLabel(analysis, t),
    resolvedPotentialIntervalLabel(analysis),
    dunnMethodLabel(analysis.settings.dunnConfidenceMode, t),
    analysis.settings.rSquaredThreshold,
    turningPointTrimLabel(analysis, t),
    `${serializeScientificNumber(analysis.dunnRecords.resolvedTurningPointTrim * 1000)} mV`,
    t("cv.quality.smoothing.auto"),
    `${serializeScientificNumber(analysis.alignedGrid.commonMinimum)}-${serializeScientificNumber(analysis.alignedGrid.commonMaximum)}`,
    diagnostics?.medianForwardRSquared ?? null,
    diagnostics?.medianReverseRSquared ?? null,
    dunnCoverage.coveragePercent,
    t(headerModeKey(metadata.headerMode)),
    metadata.orderedScanRates.map(serializeScientificNumber).join(" ")
  ];
}

function dunnExportRows(
  analysis: AnalysisState,
  sortedRates: number[],
  t: ReturnType<typeof useI18n>["t"]
): Array<Array<string | number | null>> {
  return sortedRates.flatMap((scanRate) =>
    flattenDunnRecords(analysis).map((record) => {
      const localFraction = record.fit
        ? localCapacitiveFraction(record.fit.k1, record.fit.k2, scanRate)
        : null;
      const localConfidence = record.fit
        ? rSquaredConfidence(record.fit.rSquared, analysis.settings.dunnConfidenceMode, analysis.settings.rSquaredThreshold)
        : null;
      return [
        scanRate,
        record.potential,
        t("cv.table.branchValue", { branch: record.branch === "forward" ? 1 : 2 }),
        record.fit?.k1 ?? null,
        record.fit?.k2 ?? null,
        record.fit?.rSquared ?? null,
        record.fit?.pointCount ?? null,
        fitStatusLabel(record.status, t),
        localFraction,
        localConfidence
      ];
    }));
}

function withWideMetadata(
  headers: string[],
  analysis: AnalysisState,
  metadata: ResultMetadata,
  t: ReturnType<typeof useI18n>["t"]
) {
  if (headers.length === 0) return headers;
  const suffix = exportMetadataHeaders(t)
    .map((header, index) => {
      const value = exportMetadataValues(analysis, metadata, t)[index] ?? null;
      return `${header}: ${typeof value === "number" ? serializeScientificNumber(value) : format(value)}`;
    })
    .join("; ");
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
