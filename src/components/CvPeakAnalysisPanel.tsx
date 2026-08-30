import { useState } from "react";
import { CvPeakOverviewChart } from "./CvPeakOverviewChart";
import { CvPeakRegressionChart } from "./CvPeakRegressionChart";
import type { CvPeakAnalysisResult, CvPeakFitStatus, CvSeries } from "../lib/cvTypes";

export interface CvPeakPanelCopy {
  overview: string;
  regression: string;
  peak: string;
  scanRate: string;
  potential: string;
  current: string;
  branch: string;
  kind: string;
  forward: string;
  reverse: string;
  oxidation: string;
  reduction: string;
  bValue: string;
  intercept: string;
  rSquared: string;
  fitPoints: string;
  coverage: string;
  fitStatus: string;
  logScanRate: string;
  logCurrent: string;
  copyAction: string;
  copyColumns: string;
  copySuccess: string;
  copyError: string;
  confirm: string;
  exclude: string;
  restore: string;
  add: string;
  remove: string;
  noPeaks: string;
  summary: string;
  adjustments: string;
  legend: string;
  empty: string;
  xPotential: string;
  yCurrent: string;
  xLogRate: string;
  yLogCurrent: string;
  complete: string;
  partial: string;
  unavailable: string;
  fitStatusLabel: (status: CvPeakFitStatus) => string;
}

interface CvPeakAnalysisPanelProps {
  series: CvSeries[];
  result: CvPeakAnalysisResult;
  selectedPeakId: string | null;
  selectedSeriesIndex: number;
  onPeakChange(id: string): void;
  onSeriesChange(index: number): void;
  onPotentialSelect(potential: number, seriesIndex: number, sourceIndex: number): void;
  onAdjustPotential(peakId: string, seriesIndex: number, potential: number): void;
  onConfirm(): void;
  onExclude(): void;
  onRestore(): void;
  onAddPeak(): void;
  onRemovePeak(): void;
  pendingAdd?: boolean;
  copy: CvPeakPanelCopy;
  metadata?: string[];
}

export function CvPeakAnalysisPanel({
  series,
  result,
  selectedPeakId,
  selectedSeriesIndex,
  onPeakChange,
  onSeriesChange,
  onPotentialSelect,
  onAdjustPotential,
  onConfirm,
  onExclude,
  onRestore,
  onAddPeak,
  onRemovePeak,
  pendingAdd = false,
  copy,
  metadata = []
}: CvPeakAnalysisPanelProps): React.ReactElement {
  const selectedFit = result.fits.find((fit) => fit.peakId === selectedPeakId) ?? result.fits[0] ?? null;
  const peakName = (index: number) => `${copy.peak} ${index}`;
  const [selectedPointColumns, setSelectedPointColumns] = useState<Set<PeakPointColumnKey>>(() => new Set());
  const [pointCopyStatus, setPointCopyStatus] = useState<"success" | "error" | null>(null);
  const pointColumns = [
    { key: "peak", label: copy.peak, shortLabel: copy.peak, width: "11%" },
    { key: "scanRate", label: copy.scanRate, shortLabel: "ν", unit: "(mV/s)", width: "14%" },
    { key: "potential", label: copy.potential, shortLabel: "E", unit: "(V)", width: "21%" },
    { key: "current", label: copy.current, shortLabel: "i", unit: "(arb.)", width: "19%" },
    { key: "logScanRate", label: copy.logScanRate, shortLabel: "ln ν", width: "16%" },
    { key: "logCurrent", label: copy.logCurrent, shortLabel: "ln |i|", width: "19%" }
  ] satisfies Array<PeakPointColumn>;
  const pointRows = result.fits.flatMap((fit) => fit.points.map((point) => {
    const candidate = point.candidate;
    return {
      fit,
      point,
      candidate,
      displayValues: {
        peak: peakName(fit.labelIndex),
        scanRate: formatCompact(point.scanRate, copy.unavailable),
        potential: formatCompact(candidate?.potential ?? null, copy.unavailable),
        current: formatCompact(candidate?.current ?? null, copy.unavailable),
        logScanRate: formatCompact(naturalLog(point.scanRate), copy.unavailable),
        logCurrent: formatCompact(naturalLog(candidate ? Math.abs(candidate.current) : null), copy.unavailable)
      },
      copyValues: {
        peak: peakName(fit.labelIndex),
        scanRate: `${point.scanRate} mV/s`,
        potential: format(candidate?.potential ?? null, 6, copy.unavailable),
        current: format(candidate?.current ?? null, 6, copy.unavailable),
        logScanRate: formatNaturalLog(point.scanRate, copy.unavailable),
        logCurrent: formatNaturalLog(candidate ? Math.abs(candidate.current) : null, copy.unavailable)
      }
    };
  }));

  function togglePointColumn(key: PeakPointColumnKey) {
    setSelectedPointColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPointCopyStatus(null);
  }

  async function copySelectedPointColumns() {
    const columns = pointColumns.filter((column) => selectedPointColumns.has(column.key));
    if (columns.length === 0) return;
    const text = [
      columns.map((column) => column.label),
      ...pointRows.map((row) => columns.map((column) => row.copyValues[column.key]))
    ].map((row) => row.join("\t")).join("\r\n");
    try {
      await navigator.clipboard.writeText(text);
      setPointCopyStatus("success");
    } catch {
      setPointCopyStatus("error");
    }
  }

  return <div data-panel-id="cv-peak-analysis" className="cv-b-vertical-stack">
    {!selectedFit && <p className="cv-analysis-notice" role="status">{copy.noPeaks}</p>}
    <div className="cv-peak-selection-controls">
      {selectedFit && <>
        <div className="cv-peak-selector-row" data-peak-control-row="selectors">
          <label>{copy.peak}
            <select name="selectedPeakId" value={selectedFit.peakId} onChange={(event) => onPeakChange(event.target.value)}>
              {result.fits.map((fit) => <option key={fit.peakId} value={fit.peakId}>{peakName(fit.labelIndex)}</option>)}
            </select>
          </label>
          <label>{copy.scanRate}
            <select name="selectedPeakSeriesIndex" value={selectedSeriesIndex} onChange={(event) => onSeriesChange(Number(event.target.value))}>
              {series.map((item, index) => <option key={`${item.label}-${index}`} value={index}>{item.scanRate} mV/s</option>)}
            </select>
          </label>
        </div>
        <div className="cv-peak-point-actions" data-peak-control-row="point-actions">
          <button type="button" onClick={onConfirm}>{copy.confirm}</button>
          <button type="button" onClick={onExclude}>{copy.exclude}</button>
          <button type="button" onClick={onRestore}>{copy.restore}</button>
        </div>
      </>}
      <div className="cv-peak-management-actions" data-peak-control-row="peak-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onAddPeak}
          disabled={result.fits.length >= result.maximumPeakCount}
          aria-pressed={pendingAdd}
        >{copy.add}</button>
        <button type="button" className="secondary-button" onClick={onRemovePeak} disabled={!selectedFit}>{copy.remove}</button>
      </div>
    </div>

    <article className="cv-analysis-card">
      <h3>{copy.overview}</h3>
      <CvPeakOverviewChart
        series={series}
        fits={result.fits}
        selectedPeakId={selectedFit?.peakId ?? null}
        selectedSeriesIndex={selectedSeriesIndex}
        onSelectPotential={onPotentialSelect}
        onSelectPeakPoint={(peakId, seriesIndex) => {
          onPeakChange(peakId);
          onSeriesChange(seriesIndex);
        }}
        title={copy.overview}
        xLabel={copy.xPotential}
        yLabel={copy.yCurrent}
        legendLabel={copy.legend}
        peakLabel={peakName}
        oxidationLabel={copy.oxidation}
        reductionLabel={copy.reduction}
        exportId="cv-peak-overview-chart"
        metadata={metadata}
      />
    </article>

    {selectedFit && <>
    <article className="cv-analysis-card">
      <h3>{copy.regression}</h3>
      <CvPeakRegressionChart
        fits={result.fits}
        title={copy.regression}
        xLabel={copy.xLogRate}
        yLabel={copy.yLogCurrent}
        emptyLabel={copy.empty}
        legendLabel={copy.legend}
        peakLabel={peakName}
        forwardLabel={copy.forward}
        reverseLabel={copy.reverse}
        oxidationLabel={copy.oxidation}
        reductionLabel={copy.reduction}
        exportId="cv-peak-regression-chart"
        metadata={metadata}
      />
    </article>

    <article className="cv-analysis-card cv-table-scroll">
      <h3>{copy.summary}</h3>
      <table className="tool-result-table" data-table-id="cv-peak-summary">
        <thead><tr>
          <th>{copy.peak}</th><th>{copy.branch}</th><th>{copy.kind}</th><th>{copy.bValue}</th><th>{copy.intercept}</th>
          <th>{copy.rSquared}</th><th>{copy.fitPoints}</th><th>{copy.coverage}</th><th>{copy.fitStatus}</th>
        </tr></thead>
        <tbody>{result.fits.map((fit) => <tr key={fit.peakId}>
          <td>{peakName(fit.labelIndex)}</td>
          <td>{fit.branch === "forward" ? copy.forward : copy.reverse}</td>
          <td>{fit.kind === "oxidation" ? copy.oxidation : copy.reduction}</td>
          <td>{format(fit.b, 4, copy.unavailable)}</td>
          <td>{format(fit.intercept, 5, copy.unavailable)}</td>
          <td>{format(fit.rSquared, 4, copy.unavailable)}</td>
          <td>{fit.pointCount}</td>
          <td>{fit.coverageCount}/{series.length} · {fit.coverageStatus === "complete" ? copy.complete : copy.partial}</td>
          <td>{copy.fitStatusLabel(fit.fitStatus)}</td>
        </tr>)}</tbody>
      </table>
    </article>

    <article className="cv-analysis-card cv-peak-points-card">
      <h3>{copy.adjustments}</h3>
      <div className="cv-table-copy-toolbar" data-peak-copy-toolbar>
        <button type="button" disabled={selectedPointColumns.size === 0} onClick={copySelectedPointColumns}>{copy.copyAction}</button>
        {pointCopyStatus && <p role="status" aria-live="polite">{pointCopyStatus === "success" ? copy.copySuccess : copy.copyError}</p>}
      </div>
      <div className="cv-table-scroll">
      <table className="tool-result-table cv-peak-points-table" data-table-id="cv-peak-points">
        <colgroup>{pointColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
        <thead><tr>
          {pointColumns.map((column) => <th scope="col" key={column.key}>
            <label className="cv-table-column-heading cv-peak-column-heading" title={column.label}>
              <span className="cv-peak-heading-text">
                <span data-peak-short-label>{column.shortLabel}</span>
                {column.unit && <small data-peak-unit>{column.unit}</small>}
              </span>
              <input
                type="checkbox"
                value={column.key}
                checked={selectedPointColumns.has(column.key)}
                aria-label={`${copy.copyColumns}: ${column.label}`}
                onChange={() => togglePointColumn(column.key)}
              />
            </label>
          </th>)}
        </tr></thead>
        <tbody>{pointRows.map(({ fit, point, candidate, displayValues }) => {
          return <tr
            key={`${fit.peakId}-${point.seriesIndex}`}
            data-peak-id={fit.peakId}
            data-series-index={point.seriesIndex}
            data-source-index={candidate?.sourceIndex ?? ""}
            data-current={candidate?.current ?? ""}
            data-point-status={point.status}
          >
            <td data-peak-cell="peak">{displayValues.peak}</td>
            <td data-peak-cell="scanRate">{displayValues.scanRate}</td>
            <td data-peak-cell="potential">{candidate ? <input
              className="cv-peak-potential-input"
              type="number"
              step="any"
              defaultValue={candidate.potential}
              key={`${fit.peakId}-${point.seriesIndex}-${candidate.sourceIndex}`}
              onFocus={() => {
                onPeakChange(fit.peakId);
                onSeriesChange(point.seriesIndex);
              }}
              onBlur={(event) => {
                const potential = Number(event.currentTarget.value);
                if (Number.isFinite(potential)) onAdjustPotential(fit.peakId, point.seriesIndex, potential);
              }}
              aria-label={`${peakName(fit.labelIndex)} ${point.scanRate} ${copy.potential}`}
            /> : copy.unavailable}</td>
            <td data-peak-cell="current">{displayValues.current}</td>
            <td data-peak-cell="logScanRate">{displayValues.logScanRate}</td>
            <td data-peak-cell="logCurrent">{displayValues.logCurrent}</td>
          </tr>;
        })}</tbody>
      </table>
      </div>
    </article>
    </>}
  </div>;
}

type PeakPointColumnKey = "peak" | "scanRate" | "potential" | "current" | "logScanRate" | "logCurrent";

interface PeakPointColumn {
  key: PeakPointColumnKey;
  label: string;
  shortLabel: string;
  unit?: string;
  width: string;
}

function format(value: number | null, decimals: number, unavailable: string) {
  return value === null || !Number.isFinite(value) ? unavailable : Number(value.toFixed(decimals)).toString();
}

function formatCompact(value: number | null, unavailable: string) {
  if (value === null || !Number.isFinite(value)) return unavailable;
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-4) return value.toExponential(3);
  return Number(value.toPrecision(5)).toString();
}

function naturalLog(value: number | null): number | null {
  return value === null || !Number.isFinite(value) || value <= 0 ? null : Math.log(value);
}

function formatNaturalLog(value: number | null, unavailable: string) {
  return value === null || !Number.isFinite(value) || value <= 0
    ? unavailable
    : format(Math.log(value), 6, unavailable);
}
