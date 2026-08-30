import { useI18n } from "../../../i18n/I18nProvider";
import {
  calculateUnresolvedTime,
  type TransportAggregate,
  type TransportInputKey,
  type TransportInvalidInput,
  type TransportInvalidReason,
  type TransportTerm,
} from "../analysis/transportTimes";
import { ResultCards, type RateResultCardItem } from "./ResultCards";
import {
  fieldDefinition,
  formatTransportPercent,
  formatTransportTime,
  TERM_LABELS,
  transportUnavailabilityReasonText,
  type CompletedTransportAnalysis,
  type TransportTranslator,
  type TransportWorkspaceMode,
} from "./transportTimePresentation";

export function TransportEmptyState({ onTryExample }: { onTryExample: () => void }) {
  const { t } = useI18n();
  const preview: ReadonlyArray<Readonly<RateResultCardItem>> = [
    { id: "example-electrical", label: t("rate.transport.electricalAggregate"), value: "≈ 48", unit: "s", type: "derived" },
    { id: "example-diffusive", label: t("rate.transport.diffusiveAggregate"), value: "≈ 1003", unit: "s", type: "derived" },
    { id: "example-kinetic", label: "t_c", value: 25, unit: "s", type: "assumed" },
  ];
  return <section className="tool-section rate-transport-empty" role="status">
    <h2>{t("rate.transport.emptyTitle")}</h2>
    <p>{t("rate.transport.emptyBody")}</p>
    <button type="button" onClick={onTryExample}>{t("rate.transport.tryExample")}</button>
    <ResultCards kind="example" items={preview} />
  </section>;
}

export function TransportTimeResults({
  analysis,
  mode,
}: {
  analysis: Readonly<CompletedTransportAnalysis>;
  mode: TransportWorkspaceMode;
}) {
  const { t } = useI18n();
  const { transport } = analysis;
  const unresolved = calculateUnresolvedTime(analysis.fittedTau, transport.terms);
  return <>
    {transport.invalidInputs.length > 0 ? <p className="tool-validation" role="alert">{t("rate.transport.invalid", {
      inputs: formatInvalidInputs(transport.invalidInputs, t),
    })}</p> : null}
    {mode === "characteristic"
      ? <CharacteristicSummary analysis={analysis} />
      : <AggregateSummary analysis={analysis} />}
    <AvailabilityTable analysis={analysis} />
    <section className="tool-section rate-transport-unresolved">
      <h2>{t("rate.transport.unresolvedTitle")}</h2>
      {unresolved.status === "unavailable"
        ? <p>{t("rate.transport.unavailableGeneric")} — {transportUnavailabilityReasonText(unresolved.unavailabilityReason, t)}</p>
        : <>
          <ResultCards kind={analysis.origin} items={[{
            id: "difference",
            label: t("rate.transport.difference"),
            value: formatTransportTime(unresolved.difference),
            unit: "s",
            type: "derived",
            detail: t("rate.transport.provenance.unresolved"),
          }, ...(unresolved.unresolvedContribution === null ? [] : [{
            id: "unresolved",
            label: t("rate.transport.unresolved"),
            value: formatTransportTime(unresolved.unresolvedContribution),
            unit: "s",
            type: "derived" as const,
            detail: t("rate.transport.provenance.unresolved"),
          }])]} />
          {unresolved.consistencyWarning
            ? <p className="tool-validation" role="alert"><strong>{t("rate.transport.consistencyWarning")}</strong></p>
            : null}
        </>}
    </section>
    {transport.relativeContributions ? <section className="tool-section rate-transport-relative">
      <h2>{t("rate.transport.relativeTitle")}</h2>
      <p>{t("rate.transport.relativeBody")}</p>
      <div className="tool-table-wrap"><table>
        <thead><tr><th>{t("rate.transport.term")}</th><th>{t("rate.transport.value")}</th><th>{t("rate.transport.source")}</th></tr></thead>
        <tbody>{transport.relativeContributions.map((item) => <tr key={item.termId}>
          <td>{t(TERM_LABELS[item.termId])}</td><td>{formatTransportPercent(item.percent)}%</td>
          <td>{t("rate.parameterType.derived")} · {t("rate.transport.provenance.relative")}</td>
        </tr>)}</tbody>
      </table></div>
    </section> : null}
  </>;
}

function AvailabilityTable({ analysis }: { analysis: Readonly<CompletedTransportAnalysis> }) {
  const { t } = useI18n();
  return <section className="tool-section rate-transport-results">
    <h2>{t("rate.transport.resultsTitle")}</h2>
    <div className="tool-table-wrap"><table>
      <thead><tr>
        <th>{t("rate.transport.term")}</th><th>{t("rate.transport.equation")}</th>
        <th>{t("rate.transport.status")}</th><th>{t("rate.transport.value")}</th><th>{t("rate.transport.source")}</th>
      </tr></thead>
      <tbody>{analysis.transport.terms.map((term) => <TransportTermRow key={term.id} term={term} analysis={analysis} />)}</tbody>
    </table></div>
  </section>;
}

function TransportTermRow({ term, analysis }: { term: Readonly<TransportTerm>; analysis: Readonly<CompletedTransportAnalysis> }) {
  const { t } = useI18n();
  const missing = term.missingInputs.map((key) => t(fieldDefinition(key).label)).join(", ");
  const invalid = formatInvalidInputs(term.invalidInputs, t);
  const status = term.status === "available"
    ? t("rate.transport.available")
    : [
      term.missingInputs.length > 0 ? t("rate.transport.missingDetail", { inputs: missing }) : undefined,
      term.invalidInputs.length > 0 ? t("rate.transport.invalidDetail", { inputs: invalid }) : undefined,
      term.missingInputs.length === 0 && term.invalidInputs.length === 0
        ? transportUnavailabilityReasonText(term.unavailabilityReason, t)
        : undefined,
    ].filter((part): part is string => Boolean(part)).join("; ");
  const provenance = term.id === "kinetic"
    ? t(analysis.origin === "example" ? "rate.transport.provenance.example" : "rate.transport.provenance.user")
    : t("rate.transport.provenance.derived", { term: term.equationTerm });
  return <tr data-transport-term={term.id}>
    <th scope="row">{t(TERM_LABELS[term.id])}</th><td><code>{term.equation}</code></td>
    <td>{term.status === "available" ? status : `${t("rate.transport.unavailableGeneric")} — ${status}`}</td>
    <td>{term.status === "available" ? `${formatTransportTime(term.value)} s` : "—"}</td>
    <td>{t(`rate.parameterType.${term.type}`)} · {provenance}</td>
  </tr>;
}

function AggregateSummary({ analysis }: { analysis: Readonly<CompletedTransportAnalysis> }) {
  const { t } = useI18n();
  const { transport } = analysis;
  const calculated = transport.complete
    ? transport.aggregates.calculatedTotal
    : transport.aggregates.availablePartialSum;
  const calculatedProvenance = transport.complete
    ? t("rate.transport.provenance.total")
    : calculated.status === "available" ? t("rate.transport.provenance.partial", {
      terms: calculated.includedTermIds.map((id) => transport.terms.find((term) => term.id === id)?.equationTerm).join(", "),
    }) : "";
  const items = [
    aggregateCard("electrical", t("rate.transport.electricalAggregate"), transport.aggregates.electrical, t("rate.transport.provenance.electrical"), t),
    aggregateCard("diffusive", t("rate.transport.diffusiveAggregate"), transport.aggregates.diffusive, t("rate.transport.provenance.diffusive"), t),
    aggregateCard("calculated", t(transport.complete ? "rate.transport.calculatedTotal" : "rate.transport.partialSum"), calculated, calculatedProvenance, t),
  ];
  return <section className="tool-section"><h2>{t("rate.transport.aggregatesTitle")}</h2><ResultCards kind={analysis.origin} items={items} /></section>;
}

function CharacteristicSummary({ analysis }: { analysis: Readonly<CompletedTransportAnalysis> }) {
  const { t } = useI18n();
  const kinetic = analysis.transport.terms.find(({ id }) => id === "kinetic");
  const comparison = calculateUnresolvedTime(analysis.fittedTau, []);
  const comparisonTotal = comparison.fittedTotal;
  const comparisonAvailable = comparisonTotal !== undefined;
  const inputProvenance = t(analysis.origin === "example"
    ? "rate.transport.provenance.example"
    : "rate.transport.provenance.user");
  const items: ReadonlyArray<Readonly<RateResultCardItem>> = [
    { id: "comparison-total", label: t("rate.transport.fittedTau"), value: comparisonAvailable ? formatTransportTime(comparisonTotal) : t("rate.analysis.notEstimable"), unit: comparisonAvailable ? "s" : undefined, type: analysis.fittedTau?.type ?? "user-input", detail: inputProvenance },
    aggregateCard("electrical", t("rate.transport.electricalAggregate"), analysis.transport.aggregates.electrical, t("rate.transport.provenance.electrical"), t),
    aggregateCard("diffusive", t("rate.transport.diffusiveAggregate"), analysis.transport.aggregates.diffusive, t("rate.transport.provenance.diffusive"), t),
    { id: "kinetic", label: "t_c", value: kinetic?.status === "available" ? formatTransportTime(kinetic.value) : t("rate.analysis.notEstimable"), unit: kinetic?.status === "available" ? "s" : undefined, type: kinetic?.type ?? "user-input", detail: kinetic?.status === "available" ? inputProvenance : undefined },
    aggregateCard("calculated", t("rate.transport.calculatedTotal"), analysis.transport.aggregates.calculatedTotal, t("rate.transport.provenance.total"), t),
  ];
  return <section className="tool-section"><h2>{t("rate.characteristicTime.title")}</h2><ResultCards kind={analysis.origin} items={items} /></section>;
}

function aggregateCard(
  id: string,
  label: string,
  aggregate: Readonly<TransportAggregate>,
  provenance: string,
  t: TransportTranslator,
): RateResultCardItem {
  const detail = [
    provenance,
    aggregate.status === "unavailable"
      ? transportUnavailabilityReasonText(aggregate.unavailabilityReason, t)
      : undefined,
  ].filter((part): part is string => Boolean(part)).join(" · ");
  return {
    id,
    label,
    value: aggregate.status === "available" ? formatTransportTime(aggregate.value) : t("rate.analysis.notEstimable"),
    unit: aggregate.status === "available" ? "s" : undefined,
    type: "derived",
    detail,
  };
}

function formatInvalidInputs(
  inputs: ReadonlyArray<Readonly<TransportInvalidInput<TransportInputKey>>>,
  t: TransportTranslator,
): string {
  return inputs.map(({ key, reason }) => `${t(fieldDefinition(key).label)} (${invalidReasonText(reason, t)})`).join(", ");
}

function invalidReasonText(reason: TransportInvalidReason, t: TransportTranslator): string {
  switch (reason) {
    case "non-finite": return t("rate.transport.reason.nonFinite");
    case "non-positive": return t("rate.transport.reason.nonPositive");
    case "out-of-range": return t("rate.transport.reason.outOfRange");
    case "missing-provenance": return t("rate.transport.reason.missingProvenance");
    case "numerical-overflow": return t("rate.transport.reason.numericalOverflow");
    case "numerical-underflow": return t("rate.transport.reason.numericalUnderflow");
  }
}
