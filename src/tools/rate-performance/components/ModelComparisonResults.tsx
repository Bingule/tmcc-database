import type { ChartSeries } from "../../../components/ScientificLineChart";
import { useI18n } from "../../../i18n/I18nProvider";
import type { ModelComparisonResult, ModelComparisonRow } from "../analysis/compareRateModels";
import { getRateModel } from "../models/registry";
import type { NormalizedRatePoint } from "../models/types";
import { createSmoothRateFitPoints, formatOptionalRateValue, formatRateValue, normalizedRateExtent } from "../utils/rateAnalysisPresentation";
import { sampleRateChartPoints } from "../utils/chartSampling";
import { createModelComparisonExportMetadata, serializeModelComparisonCsv, serializeModelComparisonResidualsCsv } from "../utils/rateComparisonExports";
import { serializeNormalizedRateCsv, serializeOriginalRateCsv } from "../utils/rateExports";
import { translatedRateModelFamily, translatedRateModelName } from "../utils/rateModelPresentation";
import { ExportToolbar, type RateCsvExportItem } from "./ExportToolbar";
import { RateChartPanel } from "./RateChartPanel";
import type { RateDataInputValue } from "./RateDataInput";

const modelColors = ["#a45d2b", "#2f6f7f", "#6e5a94", "#47764c"] as const;
const DISPLAY_POINT_LIMIT = 2_000;
export type ComparisonChart = "capacity" | "residuals";

export function ModelComparisonResults({ input, normalized, result, chart, onChartChange, visibleModels, onToggleModel, onExportError }: {
  input: Readonly<RateDataInputValue>;
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>;
  result: Readonly<ModelComparisonResult>;
  chart: ComparisonChart;
  onChartChange: (chart: ComparisonChart) => void;
  visibleModels: ReadonlyArray<string>;
  onToggleModel: (modelId: string) => void;
  onExportError: () => void;
}) {
  const { t } = useI18n();
  const unavailable = t("rate.analysis.notEstimable");
  const criterion = result.criterion ?? unavailable;
  const fitData = normalized.map(({ analysisRate: rate, analysisCapacity: capacity }) => ({ rate, capacity }));
  const metadata = createModelComparisonExportMetadata(normalized, input.normalizationContext, result);
  const csvItems: RateCsvExportItem[] = [
    { id: "original", label: t("rate.analysis.exportOriginal"), filename: "rate-comparison-original.csv", csv: serializeOriginalRateCsv(input.points.filter(({ rate, capacity }) => rate !== null || capacity !== null), metadata) },
    { id: "processed", label: t("rate.analysis.exportProcessed"), filename: "rate-comparison-processed.csv", csv: serializeNormalizedRateCsv(normalized, metadata) },
    { id: "comparison", label: t("rate.modelComparison.exportComparison"), filename: "rate-model-comparison.csv", csv: serializeModelComparisonCsv(result, metadata) },
    { id: "residuals", label: t("rate.analysis.exportResiduals"), filename: "rate-model-residuals.csv", csv: serializeModelComparisonResidualsCsv(fitData, result, metadata) },
  ];
  const convergedRows = result.rows.filter((row) => row.convergence === "converged");
  return <div className="rate-comparison-results">
    <section className="tool-section">
      <h2>{t("rate.modelComparison.resultsTitle")}</h2><p>{t("rate.modelComparison.criterionUsed", { criterion })}</p>
      <div className="tool-table-wrap"><table className="rate-comparison-table"><thead><tr>
        <th>{t("rate.modelComparison.table.model")}</th><th>{t("rate.modelComparison.table.equationType")}</th>
        <th>{t("rate.modelComparison.table.parameters")}</th><th>{t("rate.modelComparison.table.count")}</th>
        <th>R²</th><th>{t("rate.modelComparison.table.adjustedRSquared")}</th><th>RMSE</th><th>AIC</th><th>AICc</th><th>BIC</th>
        <th>{t("rate.modelComparison.table.delta", { criterion })}</th><th>{t("rate.modelComparison.table.convergence")}</th><th>{t("rate.modelComparison.table.rank")}</th>
      </tr></thead><tbody>{result.rows.map((row) => <tr key={row.modelId}>
        <th scope="row">{translatedRateModelName(row.modelId, t)}</th><td>{translatedRateModelFamily(row.equationType, t)}</td>
        <td>{formatParameters(row, unavailable)}</td><td>{row.parameterCount}</td>
        <td>{formatOptionalRateValue(row.statistics?.rSquared ?? null, unavailable)}</td>
        <td>{formatOptionalRateValue(row.statistics?.adjustedRSquared ?? null, unavailable)}</td>
        <td>{formatOptionalRateValue(row.statistics?.rmse ?? null, unavailable)}</td>
        <td>{formatOptionalRateValue(row.statistics?.aic ?? null, unavailable)}</td>
        <td>{formatOptionalRateValue(row.statistics?.aicc ?? null, unavailable)}</td>
        <td>{formatOptionalRateValue(row.statistics?.bic ?? null, unavailable)}</td>
        <td>{formatOptionalRateValue(row.deltaCriterion, unavailable)}</td>
        <td>{row.convergence === "converged" ? t("rate.modelComparison.table.converged") : t("rate.modelComparison.table.failed", { code: translatedFailure(row, t) })}</td>
        <td>{row.rank ?? unavailable}</td>
      </tr>)}</tbody></table></div>
    </section>
    <section className="tool-section rate-comparison-recommendation"><h2>{t("rate.modelComparison.recommendationTitle")}</h2><p>{recommendationText(result, t)}</p></section>
    <section className="tool-section rate-comparison-charts">
      <h2>{t("rate.analysis.chartsTitle")}</h2>
      <fieldset className="rate-comparison-curve-toggles"><legend>{t("rate.modelComparison.curvesTitle")}</legend>
        {convergedRows.map((row) => <label key={row.modelId}><input type="checkbox" checked={visibleModels.includes(row.modelId)} onChange={() => onToggleModel(row.modelId)} />{t("rate.modelComparison.curveToggle", { model: translatedRateModelName(row.modelId, t) })}</label>)}
      </fieldset>
      <div className="rate-input-actions" role="group" aria-label={t("rate.modelComparison.chartTabs")}>
        <button type="button" aria-pressed={chart === "capacity"} onClick={() => onChartChange("capacity")}>{t("rate.modelComparison.chart.capacity")}</button>
        <button type="button" aria-pressed={chart === "residuals"} onClick={() => onChartChange("residuals")}>{t("rate.modelComparison.chart.residuals")}</button>
      </div>
      {normalized.length > DISPLAY_POINT_LIMIT ? <p className="rate-chart-sampling-note">{t("rate.modelComparison.chart.samplingNotice", { display: DISPLAY_POINT_LIMIT.toLocaleString("en-US"), raw: normalized.length.toLocaleString("en-US") })}</p> : null}
      <ComparisonChartPanel chart={chart} rows={convergedRows} normalized={normalized} visibleModels={visibleModels} />
    </section>
    <ExportToolbar csvItems={csvItems} figureExportId="rate-model-comparison-chart" figureFilename={`rate-model-comparison-${chart}`} onError={onExportError} />
  </div>;
}

function ComparisonChartPanel({ chart, rows, normalized, visibleModels }: {
  chart: ComparisonChart;
  rows: ReadonlyArray<Readonly<ModelComparisonRow>>;
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>;
  visibleModels: ReadonlyArray<string>;
}) {
  const { t } = useI18n();
  const visible = rows.filter(({ modelId }) => visibleModels.includes(modelId));
  const observed: ChartSeries = { id: "comparison-observed", label: t("rate.modelComparison.chart.observed"), points: sampleRateChartPoints(normalized.map(({ id, analysisRate: x, analysisCapacity: y }) => ({ id, x, y })), DISPLAY_POINT_LIMIT), color: "#17242a", mode: "points" };
  const series: ChartSeries[] = chart === "capacity"
    ? [observed, ...visible.flatMap((row, index) => {
      const model = getRateModel(row.modelId);
      return model?.fit && row.parameters ? [{ id: `comparison-fit-${row.modelId}`, label: translatedRateModelName(row.modelId, t), points: createSmoothRateFitPoints(normalized, row.parameters, model.fit), color: modelColors[index % modelColors.length], mode: "line" as const }] : [];
    })]
    : residualSeries(visible, normalized, t);
  return <RateChartPanel title={t(chart === "capacity" ? "rate.modelComparison.chart.capacityTitle" : "rate.modelComparison.chart.residualTitle")} xLabel={t("rate.analysis.rateAxis")} yLabel={t(chart === "capacity" ? "rate.analysis.capacityAxis" : "rate.analysis.residualAxis")} series={series} xScale="log10" exportId="rate-model-comparison-chart" />;
}

function residualSeries(rows: ReadonlyArray<Readonly<ModelComparisonRow>>, normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>, t: ReturnType<typeof useI18n>["t"]): ChartSeries[] {
  const { minimum, maximum } = normalizedRateExtent(normalized);
  return [
    ...rows.flatMap((row, index) => row.residuals ? [{ id: `comparison-residual-${row.modelId}`, label: translatedRateModelName(row.modelId, t), points: sampleRateChartPoints(normalized.map((point, pointIndex) => ({ id: point.id, x: point.analysisRate, y: row.residuals?.[pointIndex] ?? 0 })), DISPLAY_POINT_LIMIT), color: modelColors[index % modelColors.length], mode: "points" as const }] : []),
    { id: "comparison-residual-zero", label: t("rate.modelComparison.chart.zero"), points: [{ x: minimum, y: 0 }, { x: maximum, y: 0 }], color: "#607d8b", dash: "5 4", mode: "line" },
  ];
}

function recommendationText(result: Readonly<ModelComparisonResult>, t: ReturnType<typeof useI18n>["t"]): string {
  if (result.recommendationReason === "recommended" && result.recommendation) return t("rate.modelComparison.recommendation.recommended", { model: translatedRateModelName(result.recommendation, t), criterion: result.criterion ?? "AIC" });
  return t(`rate.modelComparison.recommendation.${result.recommendationReason}`);
}

function formatParameters(row: Readonly<ModelComparisonRow>, unavailable: string): string {
  return row.parameters ? `Q_M=${formatRateValue(row.parameters.qM)}; τ=${formatRateValue(row.parameters.tau)}; n=${formatRateValue(row.parameters.n)}` : unavailable;
}

function translatedFailure(row: Readonly<ModelComparisonRow>, t: ReturnType<typeof useI18n>["t"]): string {
  switch (row.failureCode) {
    case "cancelled": return t("rate.analysis.error.cancelled");
    case "timeout": return t("rate.analysis.error.timeout");
    case "maximum-iterations": return t("rate.analysis.error.maximumIterations");
    case "insufficient-data": return t("rate.analysis.error.insufficientData");
    case "too-many-points": return t("rate.analysis.error.tooManyPoints", { max: "20,000" });
    case "model-not-found":
    case "model-not-validated": return t("rate.analysis.error.modelUnavailable");
    case "invalid-data": return t("rate.analysis.error.invalidData");
    case "invalid-options":
    case "optimizer-error":
    case "non-finite-result":
    case "non-finite-prediction": return t("rate.analysis.error.fitFailed");
    case null: return t("rate.modelComparison.error.unexpected");
  }
}
