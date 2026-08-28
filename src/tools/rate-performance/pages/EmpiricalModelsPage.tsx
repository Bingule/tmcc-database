import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { listRateModels } from "../models/registry";
import type { RateModelDefinition } from "../models/types";
import { translatedRateModelFamily, translatedRateModelName, translatedRateParameterName } from "../utils/rateModelPresentation";

export default function EmpiricalModelsPage() {
  const { t } = useI18n();
  const currentPath = "/tools/rate-performance/empirical-models";
  const validatedIds = listRateModels().filter(({ status, fit }) => status === "validated" && fit).map(({ id }) => id).join(",");
  return <section className="tools-page">
    <Breadcrumbs current={t("rate.empiricalModels.title")} />
    <header className="tool-page-header"><h1>{t("rate.empiricalModels.title")}</h1><p>{t("rate.empiricalModels.subtitle")}</p></header>
    <RatePerformanceNav currentPath={currentPath} />
    <div className="rate-model-library">{listRateModels().map((model) => <ModelCard key={model.id} model={model} compareIds={validatedIds} />)}</div>
  </section>;
}

function ModelCard({ model, compareIds }: { model: Readonly<RateModelDefinition>; compareIds: string }) {
  const { t } = useI18n();
  const validated = model.status === "validated" && Boolean(model.fit);
  return <article className={`tool-section rate-model-card rate-model-card-${model.status}`}>
    <header><div><h2>{translatedRateModelName(model.id, t)}</h2><p>{translatedRateModelFamily(model.family, t)}</p></div>
      <strong className="rate-model-status">{t(validated ? "rate.empiricalModels.validated" : "rate.empiricalModels.pending")}</strong>
    </header>
    <ModelField label={t("rate.empiricalModels.equation")} value={validated ? model.equation : t("rate.empiricalModels.pendingEquation")} math={validated} />
    <ModelField label={t("rate.empiricalModels.parameters")} value={validated
      ? model.parameters.map((parameter) => `${parameter.symbol} — ${translatedRateParameterName(parameter.id, t)} (${parameter.unit})`).join("; ")
      : t("rate.empiricalModels.pendingParameters")} />
    <ModelField label={t("rate.empiricalModels.requiredInput")} value={validated ? t("rate.model.input.measuredRate") : t("rate.empiricalModels.pendingInput")} />
    <ModelField label={t("rate.empiricalModels.usefulRegime")} value={validated
      ? t(model.id === "tian-characteristic-time" ? "rate.model.regime.tian" : "rate.model.regime.rational")
      : t("rate.empiricalModels.pendingRegime")} />
    <ModelField label={t("rate.empiricalModels.limitations")} value={validated
      ? t(model.id === "tian-characteristic-time" ? "rate.model.limitation.tian" : "rate.model.limitation.rational")
      : t("rate.empiricalModels.pendingLimitations")} />
    <ModelField label={t("rate.empiricalModels.primaryReference")} value={validated
      ? t(model.id === "tian-characteristic-time" ? "rate.model.reference.tian" : "rate.model.reference.rational")
      : t("rate.empiricalModels.pendingReference")} />
    {validated ? <nav className="rate-model-card-actions">
      <a href={`/tools/rate-performance/model-comparison?models=${encodeURIComponent(model.id)}`}>{t("rate.empiricalModels.use")}</a>
      <a href={`/tools/rate-performance/model-comparison?models=${encodeURIComponent(compareIds)}`}>{t("rate.empiricalModels.compare")}</a>
    </nav> : null}
  </article>;
}

function ModelField({ label, value, math = false }: { label: string; value: string; math?: boolean }) {
  return <section><h3>{label}</h3>{math
    ? <div className="rate-equation" role="math" aria-label={value}>{value}</div>
    : <p>{value}</p>}</section>;
}
