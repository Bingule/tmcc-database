import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import type { TranslationKey } from "../../../locales/en";
import {
  compareRateModels,
  ModelComparisonError,
  type ModelComparisonResult,
} from "../analysis/compareRateModels";
import { MAX_SYNC_RATE_FIT_POINTS } from "../analysis/fitRatePerformance";
import { FitStatus } from "../components/FitStatus";
import { ModelComparisonResults, type ComparisonChart } from "../components/ModelComparisonResults";
import {
  createInitialRateDataInputValue,
  RateDataInput,
  type RateDataInputValue,
} from "../components/RateDataInput";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { listRateModels } from "../models/registry";
import type { NormalizedRatePoint } from "../models/types";
import { translatedRateModelName } from "../utils/rateModelPresentation";
import { normalizeRatePoints } from "../utils/rateUnits";

const currentPath = "/tools/rate-performance/model-comparison";
const validatedModels = listRateModels().filter((model) => model.status === "validated" && model.fit);

export default function ModelComparisonPage() {
  const { t } = useI18n();
  const [input, setInput] = useState<RateDataInputValue>(createInitialRateDataInputValue);
  const [selected, setSelected] = useState<ReadonlyArray<string>>(() => initialSelection());
  const [normalized, setNormalized] = useState<ReadonlyArray<Readonly<NormalizedRatePoint>> | null>(null);
  const [result, setResult] = useState<ModelComparisonResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [chart, setChart] = useState<ComparisonChart>("capacity");
  const [visibleModels, setVisibleModels] = useState<ReadonlyArray<string>>([]);
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => () => invalidatePending(generation, activeController), []);

  function invalidate() {
    invalidatePending(generation, activeController);
    setPending(false);
    setNormalized(null);
    setResult(null);
    setError(null);
  }

  function replaceInput(next: RateDataInputValue) {
    invalidate();
    setInput(next);
  }

  function toggleModel(modelId: string) {
    invalidate();
    setSelected((current) => current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId]);
  }

  async function compare() {
    if (selected.length === 0) {
      setError("rate.modelComparison.error.noModels");
      setResult(null);
      return;
    }
    const populated = input.points.filter(({ rate, capacity }) => rate !== null || capacity !== null);
    if (populated.length <= 3) {
      setError("rate.modelComparison.error.insufficientData");
      setResult(null);
      return;
    }
    let points: NormalizedRatePoint[];
    try {
      points = normalizeRatePoints(populated, input.normalizationContext);
    } catch {
      setError("rate.modelComparison.error.invalidData");
      setResult(null);
      return;
    }
    if (points.length > MAX_SYNC_RATE_FIT_POINTS) {
      setError("rate.analysis.error.tooManyPoints");
      setResult(null);
      return;
    }

    invalidatePending(generation, activeController);
    const token = generation.current;
    const controller = new AbortController();
    activeController.current = controller;
    setNormalized(points);
    setResult(null);
    setError(null);
    setPending(true);
    try {
      const comparison = await compareRateModels(
        points.map(({ analysisRate: rate, analysisCapacity: capacity }) => ({ rate, capacity })),
        selected,
        { signal: controller.signal },
      );
      if (generation.current !== token || activeController.current !== controller) return;
      activeController.current = null;
      setPending(false);
      setResult(comparison);
      setVisibleModels(comparison.rows.filter(({ convergence }) => convergence === "converged").map(({ modelId }) => modelId));
    } catch (caught) {
      if (generation.current !== token || activeController.current !== controller) return;
      activeController.current = null;
      setPending(false);
      setResult(null);
      setError(caught instanceof ModelComparisonError && caught.code === "noModelsSelected"
        ? "rate.modelComparison.error.noModels"
        : "rate.modelComparison.error.unexpected");
    }
  }

  function cancel() {
    if (!pending) return;
    invalidatePending(generation, activeController);
    setPending(false);
    setResult(null);
    setError("rate.modelComparison.cancelled");
  }

  const failed = result?.rows.some(({ convergence }) => convergence === "failed") ?? false;
  const status = pending ? "loading" : result ? failed ? "partial" : "converged" : error ? "failed" : "idle";
  const statusMessage = error
    ? t(error, error === "rate.analysis.error.tooManyPoints" ? { max: MAX_SYNC_RATE_FIT_POINTS.toLocaleString("en-US") } : undefined)
    : pending
      ? t("rate.modelComparison.loading")
      : result
        ? failed
          ? t("rate.modelComparison.partial", {
            converged: result.rows.filter(({ convergence }) => convergence === "converged").length,
            selected: result.rows.length,
            points: result.usedPointCount,
          })
          : t("rate.modelComparison.completed", { points: result.usedPointCount })
        : undefined;

  return <section className="tools-page">
    <Breadcrumbs current={t("rate.modelComparison.title")} />
    <header className="tool-page-header"><h1>{t("rate.modelComparison.title")}</h1><p>{t("rate.modelComparison.subtitle")}</p></header>
    <RatePerformanceNav currentPath={currentPath} />
    <div className="tool-layout">
      <RateDataInput value={input} onChange={replaceInput} />
      <section className="tool-section rate-model-selection">
        <h2>{t("rate.modelComparison.selectionTitle")}</h2>
        <p>{t("rate.modelComparison.selectionHelp")}</p>
        <div className="rate-model-selection-list">{listRateModels().map((model) => {
          const enabled = model.status === "validated" && Boolean(model.fit);
          const name = translatedRateModelName(model.id, t);
          return <label key={model.id} className={`rate-model-option rate-model-option-${model.status}`}>
            <input type="checkbox" checked={enabled && selected.includes(model.id)} disabled={!enabled || pending} onChange={() => toggleModel(model.id)} />
            <span><strong>{name}</strong><small>{enabled
              ? t("rate.modelComparison.validated")
              : `${t("rate.modelComparison.pending")} — ${t("rate.modelComparison.pendingDisabled")}`}</small></span>
          </label>;
        })}</div>
      </section>
      <section className="tool-section rate-comparison-actions">
        <h2>{t("rate.modelComparison.runTitle")}</h2><p>{t("rate.modelComparison.runHelp")}</p>
        <div className="rate-input-actions">
          <button type="button" disabled={pending} onClick={() => void compare()}>{t("rate.modelComparison.compare")}</button>
          {pending ? <button type="button" onClick={cancel}>{t("rate.modelComparison.cancel")}</button> : null}
        </div>
        <FitStatus status={status} message={statusMessage} />
      </section>
    </div>
    {result && normalized ? <ModelComparisonResults
      input={input} normalized={normalized} result={result} chart={chart} onChartChange={setChart}
      visibleModels={visibleModels}
      onToggleModel={(modelId) => setVisibleModels((current) => current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId])}
      onExportError={() => setError("rate.modelComparison.error.export")}
    /> : null}
  </section>;
}

function initialSelection(): string[] {
  if (typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("models")?.split(",") ?? [];
    const allowed = requested.filter((id) => validatedModels.some((model) => model.id === id));
    if (allowed.length > 0) return [...new Set(allowed)];
  }
  return validatedModels.map(({ id }) => id);
}

function invalidatePending(generation: React.MutableRefObject<number>, controller: React.MutableRefObject<AbortController | null>) {
  generation.current += 1;
  controller.current?.abort();
  controller.current = null;
}
