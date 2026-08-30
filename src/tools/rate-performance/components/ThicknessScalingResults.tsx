import { useI18n } from "../../../i18n/I18nProvider";
import type { ThicknessScalingConverged, ThicknessScalingFit } from "../analysis/thicknessScaling";
import { sampleRateChartPoints } from "../utils/chartSampling";
import type { ThicknessExportContext } from "../utils/thicknessExports";
import { RateChartPanel } from "./RateChartPanel";
import { ThicknessExportPanel } from "./ThicknessExportPanel";

export interface ThicknessSampleFailure {
  readonly id: string;
  readonly sampleName: string;
  readonly reason: string;
}

const fitColors = { linear: "#d97706", quadratic: "#6d28d9", power: "#0f766e" } as const;
const MAX_THICKNESS_DISPLAY_POINTS = 2_000;

export function ThicknessScalingResults({
  result,
  failures,
  totalSampleCount,
  exportContext: providedExportContext,
  onExportError,
}: {
  result: Readonly<ThicknessScalingConverged>;
  failures: ReadonlyArray<Readonly<ThicknessSampleFailure>>;
  totalSampleCount: number;
  exportContext?: Readonly<ThicknessExportContext>;
  onExportError: () => void;
}) {
  const { t } = useI18n();
  const exportContext = providedExportContext ?? {
    resultKind: "user" as const,
    exampleId: null,
    sources: [],
    outcomes: [],
    scalingFailure: null,
  };
  const power = result.fits.power;
  const alphaCi = power.parameters.alphaConfidenceInterval95;
  const rawObserved = result.samples.map(({ thicknessMicrometres: x, tauSeconds: y }) => ({ x, y }));
  const observed = sampleRateChartPoints(rawObserved, MAX_THICKNESS_DISPLAY_POINTS);
  const observedSquared = sampleRateChartPoints(
    result.samples.map(({ thicknessMicrometres, tauSeconds: y }) => ({ x: thicknessMicrometres ** 2, y })),
    MAX_THICKNESS_DISPLAY_POINTS,
  );
  const fitted = (fit: ThicknessScalingFit, transformX: (value: number) => number) => sampleRateChartPoints(result.samples
    .map((sample, index) => ({ x: transformX(sample.thicknessMicrometres), y: fit.predictions[index] }))
    .sort((left, right) => left.x - right.x), MAX_THICKNESS_DISPLAY_POINTS);
  const rawPointCount = result.samples.length;
  const displayedPointCount = observed.length;

  return <section className="rate-thickness-results">
    <section className="tool-section">
      <p className="rate-result-kind">{t(`rate.results.${exportContext.resultKind}`)}</p>
      <h2>{t("rate.thickness.resultsTitle")}</h2>
      <p>{t("rate.thickness.processed", { success: result.samples.length, total: totalSampleCount })}</p>
      <dl className="rate-thickness-summary">
        <div><dt>{t("rate.thickness.bestModel")}</dt><dd>{result.bestModelId ?? t("rate.thickness.noUniqueBest")}</dd></div>
        <div><dt>{t("rate.thickness.criterion")}</dt><dd>{result.criterion.name}</dd></div>
        <div><dt>{t("rate.thickness.weighting")}</dt><dd>{t(result.weighting === "tau-standard-error" ? "rate.thickness.weighted" : "rate.thickness.unweighted")}</dd></div>
        <div><dt>{t("rate.thickness.alpha")}</dt><dd>{format(power.parameters.alpha)}</dd></div>
        <div><dt>{t("rate.thickness.alphaCi")}</dt><dd>{alphaCi ? `${format(alphaCi.lower)}–${format(alphaCi.upper)}` : t("rate.thickness.notEstimable")}</dd></div>
      </dl>
      <p>{t("rate.thickness.criterionLogic")}</p>
    </section>

    {failures.length > 0 ? <section className="tool-section rate-thickness-failures">
      <h2>{t("rate.thickness.failuresTitle")}</h2>
      <ul>{failures.map((failure) => <li key={failure.id}><strong>{failure.sampleName}</strong>: {failure.reason}</li>)}</ul>
    </section> : null}

    <section className="tool-section rate-thickness-models">
      <h2>{t("rate.thickness.modelsTitle")}</h2>
      <div className="tool-table-wrap"><table>
        <thead><tr>
          <th>{t("rate.thickness.model")}</th><th>{t("rate.thickness.parameters")}</th>
          <th>{t("rate.thickness.rSquared")}</th><th>{t("rate.thickness.rmse")}</th>
        </tr></thead>
        <tbody>{Object.values(result.fits).map((fit) => <tr key={fit.modelId}>
          <td>{fit.equation}</td><td>{parameters(fit)}</td><td>{format(fit.statistics.rSquared)}</td>
          <td>{format(fit.statistics.rmse)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <div className="rate-thickness-charts">
      <RateChartPanel
        title={t("rate.thickness.chart.linear")}
        xLabel={t("rate.thickness.chart.thickness")}
        yLabel={t("rate.thickness.chart.tau")}
        exportId="rate-thickness-linear"
        metadata={[t("rate.thickness.criterionLogic"), t("rate.thickness.interpretation")]}
        rawPointCount={rawPointCount}
        displayedPointCount={displayedPointCount}
        series={[
          { id: "thickness-observed-l", label: t("rate.thickness.chart.observed"), color: "#16697a", mode: "points", points: observed },
          { id: "thickness-linear-fit", label: t("rate.thickness.chart.fit"), color: fitColors.linear, points: fitted(result.fits.linear, (value) => value) },
        ]}
      />
      <RateChartPanel
        title={t("rate.thickness.chart.quadratic")}
        xLabel={t("rate.thickness.chart.thicknessSquared")}
        yLabel={t("rate.thickness.chart.tau")}
        exportId="rate-thickness-quadratic"
        metadata={t("rate.thickness.interpretation")}
        rawPointCount={rawPointCount}
        displayedPointCount={displayedPointCount}
        series={[
          { id: "thickness-observed-l2", label: t("rate.thickness.chart.observed"), color: "#16697a", mode: "points", points: observedSquared },
          { id: "thickness-quadratic-fit", label: t("rate.thickness.chart.fit"), color: fitColors.quadratic, points: fitted(result.fits.quadratic, (value) => value ** 2) },
        ]}
      />
      <RateChartPanel
        title={t("rate.thickness.chart.log")}
        xLabel={t("rate.thickness.chart.thickness")}
        yLabel={t("rate.thickness.chart.tau")}
        xScale="log10"
        yScale="log10"
        exportId="rate-thickness-log"
        metadata={t("rate.thickness.interpretation")}
        rawPointCount={rawPointCount}
        displayedPointCount={displayedPointCount}
        series={[
          { id: "thickness-observed-log", label: t("rate.thickness.chart.observed"), color: "#16697a", mode: "points", points: observed },
          { id: "thickness-power-fit", label: t("rate.thickness.chart.fit"), color: fitColors.power, points: fitted(result.fits.power, (value) => value) },
        ]}
      />
    </div>

    <ThicknessExportPanel result={result} context={exportContext} onExportError={onExportError} />

    <section className="tool-section rate-thickness-interpretation">
      <h2>{t("rate.thickness.interpretationTitle")}</h2>
      <p>{t("rate.thickness.interpretation")}</p>
      <p>{t("rate.thickness.policy")}</p>
    </section>
  </section>;
}

function format(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return Number(value.toPrecision(5)).toString();
}

function parameters(fit: ThicknessScalingFit): string {
  switch (fit.modelId) {
    case "linear": return `b0=${format(fit.parameters.interceptSeconds)} s; b1=${format(fit.parameters.slopeSecondsPerMetre)} s m^-1`;
    case "quadratic": return `b0=${format(fit.parameters.interceptSeconds)} s; b2=${format(fit.parameters.coefficientSecondsPerMetreSquared)} s m^-2`;
    case "power": return `a=${format(fit.parameters.amplitude)} s·m^-α; α=${format(fit.parameters.alpha)}`;
  }
}
