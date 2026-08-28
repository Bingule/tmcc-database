import type { ChartSeries } from "../../../components/ScientificLineChart";
import { useI18n } from "../../../i18n/I18nProvider";
import type { TranslationKey } from "../../../locales/en";
import type { RateFitResult } from "../analysis/fitRatePerformance";
import { getRateModel } from "../models/registry";
import { transitionRate } from "../models/tianCharacteristicTime";
import type { NormalizedRatePoint, RateModelDefinition, RateModelFitFunction } from "../models/types";
import { createSmoothRateFitPoints, formatOptionalRateValue, formatRateValue, normalizedRateExtent, type SmoothRateFitPoint } from "../utils/rateAnalysisPresentation";
import { sampleRateChartPoints } from "../utils/chartSampling";
import {
  serializeNormalizedRateCsv,
  serializeOriginalRateCsv,
  serializeRateFittedCurveCsv,
  serializeRateParametersCsv,
  serializeRateResidualsCsv,
  type RateExportMetadata,
  type RateFitExportPoint,
} from "../utils/rateExports";
import type { RateDataInputValue } from "./RateDataInput";
import { ExportToolbar, type RateCsvExportItem } from "./ExportToolbar";
import { RateChartPanel } from "./RateChartPanel";
import { ResultCards, type RateResultCardItem } from "./ResultCards";

const MODEL_ID = "tian-characteristic-time";
const DISPLAY_POINT_LIMIT = 2_000;
const SMOOTH_FIT_POINT_COUNT = 161;
const model = requireFittableModel();

function requireFittableModel(): Readonly<RateModelDefinition> & { readonly fit: RateModelFitFunction } {
  const candidate = getRateModel(MODEL_ID);
  if (!candidate?.fit) throw new Error("The validated Tian rate model is unavailable.");
  return { ...candidate, fit: candidate.fit };
}

export type RateAnalysisChartTab = "capacity-linear" | "capacity-log" | "log-log" | "residuals";

export function RateAnalysisResults({
  input,
  normalized,
  result,
  visibleChart,
  onVisibleChartChange,
  onExportError,
}: {
  input: Readonly<RateDataInputValue>;
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>;
  result: Extract<RateFitResult, { status: "converged" }>;
  visibleChart: RateAnalysisChartTab;
  onVisibleChartChange: (tab: RateAnalysisChartTab) => void;
  onExportError: () => void;
}) {
  const { t } = useI18n();
  const rt = transitionRate(result.parameters);
  const primaryItems: RateResultCardItem[] = [
    { id: "qM", label: "Q_M", value: formatRateValue(result.parameters.qM), unit: "mAh g^-1", type: "fitted" },
    { id: "tau", label: "τ", value: formatRateValue(result.parameters.tau), unit: "h", type: "fitted" },
    { id: "n", label: "n", value: formatRateValue(result.parameters.n), type: "fitted" },
    { id: "transition-rate", label: "R_T", value: formatRateValue(rt), unit: "h^-1", type: "derived", detail: t("rate.analysis.rtDefinition") },
    { id: "r-squared", label: "R²", value: formatOptionalRateValue(result.statistics.rSquared, t("rate.analysis.notEstimable")) },
    { id: "rmse", label: "RMSE", value: formatOptionalRateValue(result.statistics.rmse, t("rate.analysis.notEstimable")), unit: "mAh g^-1" },
  ];
  const fitRows: RateFitExportPoint[] = normalized.map((point, index) => ({
    rate: point.analysisRate,
    observedCapacity: point.analysisCapacity,
    fittedCapacity: result.predictions[index],
    residual: result.residuals[index],
  }));
  const metadata: RateExportMetadata = {
    modelId: result.modelId,
    rateDefinition: model.independentVariable.definition,
    normalizationBasis: "R in h^-1; Q in mAh g^-1",
    settings: { weighting: "unweighted", usedPointCount: result.usedPointCount },
  };
  const smoothFit = createSmoothRateFitPoints(normalized, result.parameters, model.fit, SMOOTH_FIT_POINT_COUNT);
  const parameterRows = [
    parameterExportRow("Q_M", "qM", "mAh g^-1", result),
    parameterExportRow("tau", "tau", "h", result),
    parameterExportRow("n", "n", "dimensionless", result),
    { name: "R_T", value: rt, unit: "h^-1", type: "derived" },
  ];
  const csvItems: RateCsvExportItem[] = [
    { id: "original", label: t("rate.analysis.exportOriginal"), filename: "rate-original.csv", csv: serializeOriginalRateCsv(input.points.filter(({ rate, capacity }) => rate !== null || capacity !== null), metadata) },
    { id: "processed", label: t("rate.analysis.exportProcessed"), filename: "rate-processed.csv", csv: serializeNormalizedRateCsv(normalized, metadata) },
    { id: "fitted", label: t("rate.analysis.exportFitted"), filename: "rate-fitted.csv", csv: serializeRateFittedCurveCsv(smoothFit.map(({ x: rate, y: fittedCapacity }) => ({ rate, fittedCapacity })), metadata) },
    { id: "parameters", label: t("rate.analysis.exportParameters"), filename: "rate-parameters.csv", csv: serializeRateParametersCsv(parameterRows, metadata, {
      statistics: result.statistics,
      convergenceStatus: result.status,
      iterations: result.iterations,
      iterationCountExact: result.iterationCountExact,
      warnings: result.warnings,
    }) },
    { id: "residuals", label: t("rate.analysis.exportResiduals"), filename: "rate-residuals.csv", csv: serializeRateResidualsCsv(fitRows, metadata) },
  ];

  return <>
    <section className="tool-section rate-analysis-results">
      <h2>{t("rate.analysis.resultsTitle")}</h2>
      <ResultCards kind="user" items={primaryItems} />
    </section>
    <AdvancedStatistics result={result} />
    <section className="tool-section rate-analysis-charts">
      <h2>{t("rate.analysis.chartsTitle")}</h2>
      <div className="rate-input-actions" role="tablist" aria-label={t("rate.analysis.chartTabs")}>{chartTabs.map((tab) => <button
        type="button"
        role="tab"
        aria-selected={visibleChart === tab.id}
        key={tab.id}
        onClick={() => onVisibleChartChange(tab.id)}
      >{t(tab.label)}</button>)}</div>
      <AnalysisChart tab={visibleChart} normalized={normalized} result={result} smoothFit={smoothFit} />
    </section>
    <ExportToolbar
      csvItems={csvItems}
      figureExportId="rate-analysis-chart"
      figureFilename={`rate-${visibleChart}`}
      onError={onExportError}
    />
  </>;
}

const chartTabs: ReadonlyArray<Readonly<{ id: RateAnalysisChartTab; label: TranslationKey }>> = [
  { id: "capacity-linear", label: "rate.analysis.chart.capacityLinear" },
  { id: "capacity-log", label: "rate.analysis.chart.capacityLog" },
  { id: "log-log", label: "rate.analysis.chart.logLog" },
  { id: "residuals", label: "rate.analysis.chart.residuals" },
];

function AnalysisChart({
  tab,
  normalized,
  result,
  smoothFit,
}: {
  tab: RateAnalysisChartTab;
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>;
  result: Extract<RateFitResult, { status: "converged" }>;
  smoothFit: ReadonlyArray<Readonly<SmoothRateFitPoint>>;
}) {
  const { t } = useI18n();
  const observed = sampleRateChartPoints(normalized.map((point) => ({
    id: point.id,
    x: point.analysisRate,
    y: point.analysisCapacity,
  })), DISPLAY_POINT_LIMIT);
  const residuals = sampleRateChartPoints(normalized.map((point, index) => ({
    id: point.id,
    x: point.analysisRate,
    y: result.residuals[index],
  })), DISPLAY_POINT_LIMIT);
  const { minimum: minimumRate, maximum: maximumRate } = normalizedRateExtent(normalized);
  const capacitySeries: ChartSeries[] = [
    { id: "rate-observed", label: t("rate.analysis.observed"), points: observed, color: "#2f6f7f", mode: "points" },
    { id: "rate-fit", label: t("rate.analysis.fittedCurve"), points: [...smoothFit], color: "#a45d2b", mode: "line" },
  ];
  const residualSeries: ChartSeries[] = [
    { id: "rate-residuals", label: t("rate.analysis.residualSeries"), points: residuals, color: "#2f6f7f", mode: "points" },
    { id: "rate-zero", label: t("rate.analysis.zeroLine"), points: [{ x: minimumRate, y: 0 }, { x: maximumRate, y: 0 }], color: "#607d8b", dash: "5 4", mode: "line" },
  ];
  const chart = chartPresentation(tab, t);
  return <RateChartPanel
    title={chart.title}
    xLabel={t("rate.analysis.rateAxis")}
    yLabel={chart.yLabel}
    series={tab === "residuals" ? residualSeries : capacitySeries}
    xScale={tab === "capacity-log" || tab === "log-log" ? "log10" : "linear"}
    yScale={tab === "log-log" ? "log10" : "linear"}
    exportId="rate-analysis-chart"
    metadata={[
      t("rate.analysis.chartMetadataModel"),
      t("rate.analysis.chartMetadataPoints", { points: result.usedPointCount }),
    ]}
    rawPointCount={normalized.length}
    displayedPointCount={observed.length}
  />;
}

function AdvancedStatistics({ result }: { result: Extract<RateFitResult, { status: "converged" }> }) {
  const { t } = useI18n();
  const unavailable = t("rate.analysis.notEstimable");
  const uncertaintyRows = (["qM", "tau", "n"] as const).map((parameter) => {
    const uncertainty = result.uncertainty.parameters[parameter];
    return {
      id: parameter,
      label: parameter === "qM" ? "Q_M" : parameter === "tau" ? "τ" : "n",
      unit: parameter === "qM" ? "mAh g^-1" : parameter === "tau" ? "h" : "dimensionless",
      standardError: formatOptionalRateValue(uncertainty.standardError, unavailable),
      interval: uncertainty.confidenceInterval95
        ? `${formatRateValue(uncertainty.confidenceInterval95.lower)} – ${formatRateValue(uncertainty.confidenceInterval95.upper)}`
        : unavailable,
    };
  });
  const statisticRows = [
    [t("rate.analysis.adjustedRSquared"), formatOptionalRateValue(result.statistics.adjustedRSquared, unavailable)],
    ["SSE", formatOptionalRateValue(result.statistics.sse, unavailable)],
    ["AIC", formatOptionalRateValue(result.statistics.aic, unavailable)],
    ["AICc", formatOptionalRateValue(result.statistics.aicc, unavailable)],
    ["BIC", formatOptionalRateValue(result.statistics.bic, unavailable)],
    [t("rate.analysis.iterations"), String(result.iterations)],
    [t("rate.analysis.convergence"), t("rate.analysis.converged")],
  ] as const;
  return <section className="tool-section rate-analysis-advanced">
    <h2>{t("rate.analysis.advancedTitle")}</h2>
    <p>{t("rate.analysis.unweighted")}</p>
    <dl className="rate-result-grid">{statisticRows.map(([label, value]) => <div className="rate-result-card" key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}</dl>
    <h3>{t("rate.analysis.uncertaintyTitle")}</h3>
    <div className="tool-table-wrap"><table><thead><tr>
      <th>{t("rate.analysis.parameter")}</th>
      <th>{t("rate.analysis.unit")}</th>
      <th>{t("rate.analysis.standardError")}</th>
      <th>{t("rate.analysis.confidenceInterval")}</th>
    </tr></thead><tbody>{uncertaintyRows.map((row) => <tr key={row.id}>
      <th scope="row">{row.label}</th><td>{row.unit}</td><td>{row.standardError}</td><td>{row.interval}</td>
    </tr>)}</tbody></table></div>
  </section>;
}

function parameterExportRow(
  name: string,
  id: "qM" | "tau" | "n",
  unit: string,
  result: Extract<RateFitResult, { status: "converged" }>,
) {
  const uncertainty = result.uncertainty.parameters[id];
  return {
    name,
    value: result.parameters[id],
    unit,
    type: "fitted",
    standardError: uncertainty.standardError,
    confidenceInterval95Lower: uncertainty.confidenceInterval95?.lower ?? null,
    confidenceInterval95Upper: uncertainty.confidenceInterval95?.upper ?? null,
  };
}

function chartPresentation(tab: RateAnalysisChartTab, t: ReturnType<typeof useI18n>["t"]) {
  switch (tab) {
    case "capacity-linear": return { title: t("rate.analysis.chartTitle.capacityLinear"), yLabel: t("rate.analysis.capacityAxis") };
    case "capacity-log": return { title: t("rate.analysis.chartTitle.capacityLog"), yLabel: t("rate.analysis.capacityAxis") };
    case "log-log": return { title: t("rate.analysis.chartTitle.logLog"), yLabel: t("rate.analysis.capacityAxis") };
    case "residuals": return { title: t("rate.analysis.chartTitle.residuals"), yLabel: t("rate.analysis.residualAxis") };
  }
}
