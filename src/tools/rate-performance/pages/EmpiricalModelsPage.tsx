import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { formatScientificUnit, ScientificMath, ScientificSymbol, ScientificUnit } from "../components/ScientificTypography";
import { listRateModels } from "../models/registry";
import type { RateModelDefinition } from "../models/types";
import { getRateReference } from "../references/rateReferences";
import type { RateReference } from "../references/types";
import { translatedRateModelFamily, translatedRateModelName, translatedRateParameterName, translatedRegistryText, translatedRegistryUnit } from "../utils/rateModelPresentation";

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
    <ModelField label={t("rate.empiricalModels.equation")} value={validated ? model.equation : t("rate.empiricalModels.pendingEquation")} tex={validated ? model.equationTex : undefined} />
    <section><h3>{t("rate.empiricalModels.parameters")}</h3>{validated
      ? <div className="tool-table-wrap"><table><thead><tr><th>{t("rate.theory.symbol")}</th><th>{t("rate.theory.parameter")}</th><th>{t("rate.theory.physicalMeaning")}</th><th>{t("rate.theory.units")}</th><th>{t("rate.theory.type")}</th></tr></thead>
        <tbody>{model.parameters.map((parameter) => <tr key={parameter.id}><td><ScientificSymbol value={parameter.symbol} /></td><td>{translatedRateParameterName(parameter.id, t)}</td><td>{translatedRegistryText(parameter.description, t)}</td><td><ScientificUnit value={translatedRegistryUnit(parameter.unit, t)} /></td><td>{t(`rate.parameterType.${parameter.type}`)}</td></tr>)}</tbody></table></div>
      : <p>{t("rate.empiricalModels.pendingParameters")}</p>}</section>
    <ModelField label={t("rate.empiricalModels.requiredInput")} value={validated
      ? t("rate.empiricalModels.input.structured", { name: translatedRegistryText(model.independentVariable.name, t), symbol: model.independentVariable.symbol, unit: formatScientificUnit(translatedRegistryUnit(model.independentVariable.unit, t)), definition: translatedRegistryText(model.independentVariable.definition, t) })
      : t("rate.empiricalModels.pendingInput")} />
    <ModelList label={t("rate.empiricalModels.usefulRegime")} values={model.applicability.map((value) => translatedRegistryText(value, t))} />
    <ModelList label={t("rate.empiricalModels.assumptions")} values={model.assumptions.map((value) => translatedRegistryText(value, t))} />
    <ModelList label={t("rate.empiricalModels.limitations")} values={model.limitations.map((value) => translatedRegistryText(value, t))} />
    <section><h3>{t("rate.empiricalModels.primaryReference")}</h3>{validated
      ? <PrimaryReference reference={resolvePrimaryReference(model)} />
      : <p>{t("rate.empiricalModels.pendingReference")}</p>}</section>
    {validated ? <nav className="rate-model-card-actions">
      <a href={`/tools/rate-performance/model-comparison?models=${encodeURIComponent(model.id)}`}>{t("rate.empiricalModels.use")}</a>
      <a href={`/tools/rate-performance/model-comparison?models=${encodeURIComponent(compareIds)}`}>{t("rate.empiricalModels.compare")}</a>
    </nav> : null}
  </article>;
}

function resolvePrimaryReference(model: Readonly<RateModelDefinition>): Readonly<RateReference> | null {
  for (const id of model.referenceIds) {
    const reference = getRateReference(id);
    if (reference?.role === "primary-model-source") return reference;
  }
  return null;
}

function PrimaryReference({ reference }: { reference: Readonly<RateReference> | null }) {
  const { t } = useI18n();
  if (!reference) return <p>{t("rate.empiricalModels.pendingReference")}</p>;
  const locator = reference.pages ?? reference.articleNumber ?? "";
  return <p>{reference.authors.join(", ")}. “{reference.title}.” <i>{reference.journal}</i> {reference.volume}{locator ? `, ${locator}` : ""} ({reference.year}). <a href={reference.url} rel="noreferrer">DOI: {reference.doi}</a></p>;
}

function ModelList({ label, values }: { label: string; values: ReadonlyArray<string> }) {
  return <section><h3>{label}</h3><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></section>;
}

function ModelField({ label, value, tex }: { label: string; value: string; tex?: string }) {
  return <section><h3>{label}</h3>{tex
    ? <ScientificMath className="rate-equation" tex={tex} source={value} label={value} display />
    : <p>{value}</p>}</section>;
}
