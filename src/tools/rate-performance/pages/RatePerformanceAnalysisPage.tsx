import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import type { TranslationKey } from "../../../locales/en";
import {
  fitRatePerformance,
  type RateFitFailureCode,
  type RateFitResult,
  type RateFitWarning,
} from "../analysis/fitRatePerformance";
import { FitStatus } from "../components/FitStatus";
import { ModelTheoryPanel, type RateTheoryContent } from "../components/ModelTheoryPanel";
import { RateChartPanel } from "../components/RateChartPanel";
import {
  RateAnalysisResults,
  type RateAnalysisChartTab,
} from "../components/RateAnalysisResults";
import {
  createInitialRateDataInputValue,
  RateDataInput,
  type RateDataInputValue,
} from "../components/RateDataInput";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { ReferenceList } from "../components/ReferenceList";
import { ResultCards, type RateResultCardItem } from "../components/ResultCards";
import { RATE_PERFORMANCE_EXAMPLE } from "../data/rateExamples";
import { getRateModel } from "../models/registry";
import type { NormalizedRatePoint, RateModelDefinition } from "../models/types";
import { getRateReference } from "../references/rateReferences";
import { RateNormalizationError, normalizeRatePoints } from "../utils/rateUnits";

const MODEL_ID = "tian-characteristic-time";
const model = requireModel();

function requireModel(): Readonly<RateModelDefinition> {
  const candidate = getRateModel(MODEL_ID);
  if (!candidate?.fit) throw new Error("The validated Tian rate model is unavailable.");
  return candidate;
}

const references = model.referenceIds.flatMap((id) => {
  const reference = getRateReference(id);
  return reference ? [reference] : [];
});

type UiErrorKey = Extract<TranslationKey, `rate.analysis.error.${string}`>;

const examplePreview: ReadonlyArray<Readonly<RateResultCardItem>> = [
  { id: "example-qm", label: "Q_M", value: "≈ 310", unit: "mAh g^-1", type: "fitted" },
  { id: "example-tau", label: "τ", value: "≈ 0.3", unit: "h", type: "fitted" },
  { id: "example-n", label: "n", value: "≈ 0.7", type: "fitted" },
];

export default function RatePerformanceAnalysisPage() {
  const { t } = useI18n();
  const currentPath = "/tools/rate-performance";
  const [input, setInput] = useState<RateDataInputValue>(createInitialRateDataInputValue);
  const [normalized, setNormalized] = useState<ReadonlyArray<Readonly<NormalizedRatePoint>> | null>(null);
  const [pending, setPending] = useState(false);
  const [fitResult, setFitResult] = useState<RateFitResult | null>(null);
  const [visibleChart, setVisibleChart] = useState<RateAnalysisChartTab>("capacity-linear");
  const [uiError, setUiError] = useState<UiErrorKey | null>(null);
  const fitGeneration = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    fitGeneration.current += 1;
    activeController.current?.abort();
  }, []);

  function replaceInput(next: RateDataInputValue) {
    fitGeneration.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setInput(next);
    setNormalized(null);
    setFitResult(null);
    setPending(false);
    setUiError(null);
  }

  function loadExample() {
    replaceInput({
      mode: "manual",
      points: RATE_PERFORMANCE_EXAMPLE.points.map((point) => ({ ...point })),
      normalizationContext: RATE_PERFORMANCE_EXAMPLE.normalizationContext ?? {},
    });
  }

  async function analyze() {
    const populated = input.points.filter(({ rate, capacity }) => rate !== null || capacity !== null);
    if (populated.length <= 3) {
      setNormalized(null);
      setFitResult(null);
      setUiError("rate.analysis.error.insufficientData");
      return;
    }

    let analysisPoints: NormalizedRatePoint[];
    try {
      analysisPoints = normalizeRatePoints(populated, input.normalizationContext);
    } catch (error) {
      setNormalized(null);
      setFitResult(null);
      setUiError(normalizationErrorKey(error));
      return;
    }

    const token = fitGeneration.current + 1;
    fitGeneration.current = token;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setNormalized(analysisPoints);
    setFitResult(null);
    setUiError(null);
    setPending(true);

    try {
      const result = await fitRatePerformance(
        analysisPoints.map(({ analysisRate: rate, analysisCapacity: capacity }) => ({ rate, capacity })),
        { modelId: MODEL_ID, signal: controller.signal },
      );
      if (fitGeneration.current !== token || activeController.current !== controller) return;
      activeController.current = null;
      setPending(false);
      setFitResult(result);
      if (result.status === "failed") setUiError(fitFailureKey(result.failure.code));
    } catch {
      if (fitGeneration.current !== token || activeController.current !== controller) return;
      activeController.current = null;
      setPending(false);
      setFitResult(null);
      setUiError("rate.analysis.error.unexpectedFit");
    }
  }

  function cancelFit() {
    if (!pending) return;
    fitGeneration.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setPending(false);
    setFitResult(null);
    setUiError("rate.analysis.error.cancelled");
  }

  const converged = fitResult?.status === "converged" && normalized ? fitResult : null;
  const warnings = fitResult?.warnings.map((warning) => warningText(warning, t)) ?? [];
  const status = pending
    ? "loading"
    : converged
      ? "converged"
      : uiError || fitResult?.status === "failed"
        ? "failed"
        : "idle";
  const statusMessage = uiError
    ? t(uiError)
    : converged
      ? t("rate.analysis.convergedMessage", { iterations: converged.iterations, points: converged.usedPointCount })
      : undefined;
  const theory = theoryContent(t);

  return <section className="tools-page">
    <Breadcrumbs current={t("rate.analysis.title")} />
    <header className="tool-page-header">
      <h1>{t("rate.analysis.title")}</h1>
      <p>{t("rate.analysis.subtitle")}</p>
    </header>
    <RatePerformanceNav currentPath={currentPath} />

    <div className="tool-layout">
      <RateDataInput value={input} onChange={replaceInput} />
      <section className="tool-section rate-analysis-actions">
        <h2>{t("rate.analysis.runTitle")}</h2>
        <p>{t("rate.analysis.runHelp")}</p>
        <div className="rate-input-actions">
          <button type="button" disabled={pending} onClick={() => void analyze()}>{t("rate.analysis.analyze")}</button>
          {pending ? <button type="button" onClick={cancelFit}>{t("rate.analysis.cancel")}</button> : null}
        </div>
        <FitStatus status={status} message={statusMessage} warnings={warnings} />
      </section>
    </div>

    {!pending && !converged && fitResult?.status !== "failed"
      ? <EmptyAnalysisState onTryExample={loadExample} showPreview={!uiError} />
      : null}

    {converged && normalized ? <RateAnalysisResults
      input={input}
      normalized={normalized}
      result={converged}
      visibleChart={visibleChart}
      onVisibleChartChange={setVisibleChart}
      onExportError={() => setUiError("rate.analysis.error.export")}
    /> : null}

    <section className="tool-section rate-analysis-quick-explanation">
      <h2>{t("rate.analysis.quickTitle")}</h2>
      <p>{t("rate.analysis.quickBody")}</p>
    </section>
    <section className="tool-section rate-analysis-equation">
      <h2>{t("rate.analysis.modelEquation")}</h2>
      <div className="rate-equation" role="math" aria-label={t("rate.analysis.equationDescription")}>{model.equation}</div>
    </section>
    <section className="tool-section rate-analysis-parameters">
      <h2>{t("rate.analysis.parameterMeaning")}</h2>
      <dl>{theory.parameters.map((parameter) => <div key={parameter.symbol}>
        <dt>{parameter.symbol}</dt><dd>{parameter.meaning} ({parameter.unit})</dd>
      </div>)}</dl>
    </section>
    <ModelTheoryPanel content={theory} />
    <ReferenceList references={references} />
  </section>;
}

function EmptyAnalysisState({ onTryExample, showPreview }: { onTryExample: () => void; showPreview: boolean }) {
  const { t } = useI18n();
  const examplePoints = RATE_PERFORMANCE_EXAMPLE.points.map((point) => ({
    x: point.rate ?? 0,
    y: point.capacity,
  }));
  return <>
    <section className="tool-section rate-analysis-example-dataset">
      <h2>{t("rate.analysis.exampleDatasetTitle")}</h2>
      <p>{t("rate.analysis.exampleDatasetBody")}</p>
      <button type="button" onClick={onTryExample}>{t("rate.analysis.tryExample")}</button>
    </section>
    <section className="tool-section rate-analysis-outputs">
      <h2>{t("rate.analysis.whatTitle")}</h2>
      <ul>
        <li>{t("rate.analysis.whatParameters")}</li>
        <li>{t("rate.analysis.whatStatistics")}</li>
        <li>{t("rate.analysis.whatCharts")}</li>
        <li>{t("rate.analysis.whatExports")}</li>
      </ul>
    </section>
    {showPreview ? <section className="tool-section rate-analysis-example-preview">
      <h2>{t("rate.analysis.examplePreviewTitle")}</h2>
      <p>{t("rate.analysis.examplePreviewBody")}</p>
      <ResultCards kind="example" items={examplePreview} />
      <RateChartPanel
        title={t("rate.analysis.exampleChart")}
        xLabel={t("rate.analysis.exampleChartX")}
        yLabel={t("rate.analysis.capacityAxis")}
        series={[{ id: "example-observed", label: t("rate.analysis.exampleObserved"), points: examplePoints, color: "#366c75", mode: "points" }]}
      />
    </section> : null}
  </>;
}

function theoryContent(t: ReturnType<typeof useI18n>["t"]): RateTheoryContent {
  return {
    title: t("rate.analysis.modelName"),
    equation: model.equation,
    equationDescription: t("rate.analysis.equationDescription"),
    parameters: model.parameters.map((parameter) => ({
      symbol: parameter.symbol,
      name: t(parameter.id === "qM" ? "rate.analysis.qmName" : parameter.id === "tau" ? "rate.analysis.tauName" : "rate.analysis.nName"),
      meaning: t(parameter.id === "qM" ? "rate.analysis.qmMeaning" : parameter.id === "tau" ? "rate.analysis.tauMeaning" : "rate.analysis.nMeaning"),
      unit: parameter.id === "qM" ? "mAh g^-1" : parameter.unit,
      type: parameter.type,
    })),
    physicalMeaning: t("rate.analysis.physicalMeaning"),
    limitingBehavior: t("rate.analysis.limitingBehavior"),
    applicability: t("rate.analysis.applicability"),
    assumptions: [t("rate.analysis.assumptionRate"), t("rate.analysis.assumptionParameters")],
    limitations: [t("rate.analysis.limitationEffective"), t("rate.analysis.limitationDefinition")],
    citationGuidance: t("rate.analysis.citationGuidance"),
  };
}

function normalizationErrorKey(error: unknown): UiErrorKey {
  if (!(error instanceof RateNormalizationError)) return "rate.analysis.error.invalidData";
  switch (error.code) {
    case "measuredRateConfirmationRequired": return "rate.analysis.error.measuredRateConfirmationRequired";
    case "theoreticalCapacityRequired": return "rate.analysis.error.theoreticalCapacityRequired";
    case "invalidTheoreticalCapacity": return "rate.analysis.error.invalidTheoreticalCapacity";
    case "positiveMeasuredCapacityRequired": return "rate.analysis.error.positiveMeasuredCapacityRequired";
    case "invalidRatePoints":
    case "nonFiniteNormalizedValue": return "rate.analysis.error.invalidData";
  }
}

function fitFailureKey(code: RateFitFailureCode): UiErrorKey {
  switch (code) {
    case "cancelled": return "rate.analysis.error.cancelled";
    case "timeout": return "rate.analysis.error.timeout";
    case "maximum-iterations": return "rate.analysis.error.maximumIterations";
    case "insufficient-data": return "rate.analysis.error.insufficientData";
    case "model-not-found":
    case "model-not-validated": return "rate.analysis.error.modelUnavailable";
    case "invalid-data": return "rate.analysis.error.invalidData";
    case "invalid-options":
    case "optimizer-error":
    case "non-finite-result":
    case "non-finite-prediction": return "rate.analysis.error.fitFailed";
  }
}

function warningText(warning: RateFitWarning, t: ReturnType<typeof useI18n>["t"]): string {
  switch (warning.code) {
    case "duplicate-rate": return t("rate.analysis.warning.duplicateRate", { rate: warning.rate });
    case "insufficient-degrees-of-freedom": return t("rate.analysis.warning.insufficientDof");
    case "singular-covariance": return t("rate.analysis.warning.singularCovariance");
    case "non-finite-jacobian": return t("rate.analysis.warning.nonFiniteJacobian");
    case "boundary-locked": return t("rate.analysis.warning.boundaryLocked", { parameter: warning.parameter });
  }
}
