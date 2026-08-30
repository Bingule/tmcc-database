import { useI18n } from "../../../i18n/I18nProvider";
import type { RateFitResult } from "../analysis/fitRatePerformance";
import type { CaReconstructionSuccess } from "../analysis/reconstructCaRate";
import type { CaReconstructionOptions } from "../analysis/reconstructCaRate";
import type { CaDraftPoint } from "./CaDataInput";
import type { NormalizedRatePoint } from "../models/types";
import { getRateModel } from "../models/registry";
import { sampleRateChartPoints } from "../utils/chartSampling";
import { createSmoothRateFitPoints, formatOptionalRateValue, formatRateValue } from "../utils/rateAnalysisPresentation";
import { serializeCaFitCurveCsv, serializeCaFitParametersCsv, serializeCaOriginalCsv, serializeCaRateCsv, serializeCaReconstructedCsv, type CaExportMetadata } from "../utils/caExports";
import { ExportToolbar, type RateCsvExportItem } from "./ExportToolbar";
import { RateChartPanel } from "./RateChartPanel";
import { ResultCards, type RateResultCardItem } from "./ResultCards";

const MAX_DISPLAY_POINTS = 1200;

export function CaAnalysisResults({ input, options, reconstruction, fit, metadata, onExportError }: {
  input: ReadonlyArray<Readonly<CaDraftPoint>>;
  options: Readonly<CaReconstructionOptions>;
  reconstruction: Readonly<CaReconstructionSuccess>;
  fit: Extract<RateFitResult, { status: "converged" }> | null;
  metadata: Readonly<CaExportMetadata>;
  onExportError?: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const model = getRateModel("rational-characteristic-time");
  if (fit && !model?.fit) return null;
  const normalized = reconstruction.ratePoints.map((point): NormalizedRatePoint => ({
    id: point.id, analysisRate: point.rate as number, analysisRateUnit: "h-1",
    analysisCapacity: point.capacity as number, analysisCapacityUnit: "mAh-g-1",
    originalRate: point.rate as number, originalRateUnit: "h-1",
    originalCapacity: point.capacity as number, originalCapacityUnit: "mAh-g-1",
    normalization: { method: "measured-rate-direct", measuredRateConfirmed: true },
  }));
  const curve = fit && model?.fit ? createSmoothRateFitPoints(normalized, fit.parameters, model.fit) : [];
  const sampled = sampleRateChartPoints(reconstruction.points.map((point) => ({ id: point.id, x: point.originalTime, y: point.originalCurrent, point })), MAX_DISPLAY_POINTS);
  const cards: RateResultCardItem[] = fit ? [
    { id: "qM", label: "Q_M", value: formatRateValue(fit.parameters.qM), unit: "mAh g^-1", type: "fitted" },
    { id: "tau", label: "τ", value: formatRateValue(fit.parameters.tau), unit: "h", type: "fitted" },
    { id: "n", label: "n", value: formatRateValue(fit.parameters.n), type: "fitted" },
    { id: "r2", label: "R²", value: formatOptionalRateValue(fit.statistics.rSquared, "—"), type: "derived" },
    { id: "rmse", label: "RMSE", value: formatOptionalRateValue(fit.statistics.rmse, "—"), unit: "mAh g^-1", type: "derived" },
  ] : [];
  const exports: RateCsvExportItem[] = [
    { id: "original", label: t("rate.ca.export.original"), filename: "ca-original.csv", csv: serializeCaOriginalCsv(input, options, metadata) },
    { id: "rate", label: t("rate.ca.export.rate"), filename: "ca-reconstructed-rate.csv", csv: serializeCaRateCsv(reconstruction, metadata) },
    { id: "processed", label: t("rate.ca.export.processed"), filename: "ca-reconstructed-all.csv", csv: serializeCaReconstructedCsv(reconstruction, metadata) },
    ...(fit ? [
      { id: "curve", label: t("rate.ca.export.curve"), filename: "ca-fitted-curve.csv", csv: serializeCaFitCurveCsv(curve, metadata) },
      { id: "parameters", label: t("rate.ca.export.parameters"), filename: "ca-fit-parameters.csv", csv: serializeCaFitParametersCsv(fit, metadata) },
    ] : []),
  ];
  const rawCount = reconstruction.points.length;
  const displayCount = sampled.length;
  return <section className="ca-results-workspace">
    {fit ? <ResultCards kind={metadata.resultKind} items={cards} /> : null}
    <div className="ca-chart-grid">
      <RateChartPanel title={t("rate.ca.chart.current")} xLabel={t("rate.ca.axis.time", { unit: options.timeUnit })} yLabel={t("rate.ca.axis.current", { unit: options.currentUnit })} rawPointCount={rawCount} displayedPointCount={displayCount} series={[{ id: "ca-current", label: "I(t)", color: "#1f6f78", points: sampled.map(({ point }) => ({ x: point.originalTime, y: point.originalCurrent })) }]} />
      <RateChartPanel title={t("rate.ca.chart.capacityTime")} xLabel={t("rate.ca.axis.time", { unit: options.timeUnit })} yLabel={t("rate.ca.axis.capacity")} rawPointCount={rawCount} displayedPointCount={displayCount} series={[{ id: "ca-capacity-time", label: "Q(t)", color: "#2e7d32", points: sampled.map(({ point }) => ({ x: point.originalTime, y: point.cumulativeCapacityMahG })) }]} />
      <RateChartPanel title={t("rate.ca.chart.rateTime")} xLabel={t("rate.ca.axis.time", { unit: options.timeUnit })} yLabel={t("rate.ca.axis.rate")} rawPointCount={rawCount} displayedPointCount={displayCount} series={[{ id: "ca-rate-time", label: "R(t)", color: "#8b5e34", points: sampled.map(({ point }) => ({ x: point.originalTime, y: point.effectiveRateH1 })) }]} />
      <RateChartPanel title={t("rate.ca.chart.capacityRate")} xLabel={t("rate.ca.axis.rate")} yLabel={t("rate.ca.axis.capacity")} xScale="log10" exportId="ca-rate-reconstruction-chart" series={[{ id: "ca-rate-capacity", label: "Q(R)", color: "#7b4f9d", mode: "points", points: reconstruction.ratePoints.map((point) => ({ x: point.rate as number, y: point.capacity })) }]} />
      {fit ? <RateChartPanel title={t("rate.ca.chart.fit")} xLabel={t("rate.ca.axis.rate")} yLabel={t("rate.ca.axis.capacity")} xScale="log10" exportId="ca-rate-fit-chart" metadata={t("rate.ca.chart.metadata")} series={[{ id: "ca-observed", label: t("rate.ca.chart.reconstructed"), color: "#1f6f78", mode: "points", points: reconstruction.ratePoints.map((point) => ({ x: point.rate as number, y: point.capacity })) }, { id: "ca-fit", label: t("rate.ca.chart.fitted"), color: "#c65d26", points: curve }]} /> : null}
    </div>
    <ExportToolbar csvItems={exports} figureExportId={fit ? "ca-rate-fit-chart" : "ca-rate-reconstruction-chart"} figureFilename={fit ? "ca-rate-fit" : "ca-rate-reconstruction"} onError={onExportError} />
  </section>;
}
