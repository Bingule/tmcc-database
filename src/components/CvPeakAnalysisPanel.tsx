import { CvPeakOverviewChart } from "./CvPeakOverviewChart";
import { CvPeakRegressionChart } from "./CvPeakRegressionChart";
import type { CvPeakAnalysisResult, CvPeakFitStatus, CvPeakPointStatus, CvSeries } from "../lib/cvTypes";

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
  pointStatus: string;
  sourceIndex: string;
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
  pointStatusLabel: (status: CvPeakPointStatus) => string;
}

interface CvPeakAnalysisPanelProps {
  series: CvSeries[];
  result: CvPeakAnalysisResult;
  selectedPeakId: string | null;
  selectedSeriesIndex: number;
  onPeakChange(id: string): void;
  onSeriesChange(index: number): void;
  onPotentialSelect(potential: number): void;
  onAdjustPotential(peakId: string, seriesIndex: number, potential: number): void;
  onConfirm(): void;
  onExclude(): void;
  onRestore(): void;
  onAddPeak(): void;
  onRemovePeak(): void;
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
  copy,
  metadata = []
}: CvPeakAnalysisPanelProps): React.ReactElement {
  const selectedFit = result.fits.find((fit) => fit.peakId === selectedPeakId) ?? result.fits[0] ?? null;
  const peakName = (index: number) => `${copy.peak} ${index}`;
  if (!selectedFit) {
    return <div data-panel-id="cv-peak-analysis" className="cv-b-vertical-stack">
      <p className="cv-analysis-notice" role="status">{copy.noPeaks}</p>
    </div>;
  }

  return <div data-panel-id="cv-peak-analysis" className="cv-b-vertical-stack">
    <div className="cv-peak-selection-controls">
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
      <div className="cv-peak-management-actions" data-peak-control-row="peak-actions">
        <button type="button" className="secondary-button" onClick={onAddPeak} disabled={result.fits.length >= result.maximumPeakCount}>{copy.add}</button>
        <button type="button" className="secondary-button" onClick={onRemovePeak}>{copy.remove}</button>
      </div>
    </div>

    <article className="cv-analysis-card">
      <h3>{copy.overview}</h3>
      <CvPeakOverviewChart
        series={series}
        fits={result.fits}
        selectedPeakId={selectedFit.peakId}
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

    <article className="cv-analysis-card cv-table-scroll">
      <h3>{copy.adjustments}</h3>
      <table className="tool-result-table" data-table-id="cv-peak-points">
        <thead><tr>
          <th>{copy.peak}</th><th>{copy.scanRate}</th><th>{copy.potential}</th><th>{copy.current}</th><th>{copy.sourceIndex}</th><th>{copy.pointStatus}</th>
        </tr></thead>
        <tbody>{result.fits.flatMap((fit) => fit.points.map((point) => {
          const candidate = point.candidate;
          return <tr
            key={`${fit.peakId}-${point.seriesIndex}`}
            data-peak-id={fit.peakId}
            data-series-index={point.seriesIndex}
            data-source-index={candidate?.sourceIndex ?? ""}
            data-current={candidate?.current ?? ""}
          >
            <td>{peakName(fit.labelIndex)}</td>
            <td>{point.scanRate} mV/s</td>
            <td>{candidate ? <input
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
            <td>{format(candidate?.current ?? null, 6, copy.unavailable)}</td>
            <td>{candidate?.sourceIndex ?? copy.unavailable}</td>
            <td>{copy.pointStatusLabel(point.status)}</td>
          </tr>;
        }))}</tbody>
      </table>
    </article>
  </div>;
}

function format(value: number | null, decimals: number, unavailable: string) {
  return value === null || !Number.isFinite(value) ? unavailable : Number(value.toFixed(decimals)).toString();
}
