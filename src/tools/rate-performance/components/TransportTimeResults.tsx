import { useI18n } from "../../../i18n/I18nProvider";
import {
  calculateUnresolvedTime,
  type TransportTerm,
  type TransportTimeResult,
} from "../analysis/transportTimes";
import { ResultCards, type RateResultCardItem } from "./ResultCards";
import {
  fieldDefinition,
  formatTransportPercent,
  formatTransportTime,
  TERM_LABELS,
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
      inputs: transport.invalidInputs.map((key) => t(fieldDefinition(key).label)).join(", "),
    })}</p> : null}
    {mode === "characteristic"
      ? <CharacteristicSummary analysis={analysis} />
      : <AggregateSummary transport={transport} />}
    <AvailabilityTable analysis={analysis} />
    <section className="tool-section rate-transport-unresolved">
      <h2>{t("rate.transport.unresolvedTitle")}</h2>
      {unresolved.status === "unavailable"
        ? <p>{t("rate.transport.unresolvedUnavailable")}</p>
        : <>
          <ResultCards kind="user" items={[{
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
  const sourceQuantity = term.id === "kinetic" ? analysis.input.kineticTime : undefined;
  const provenance = sourceQuantity ? sourceQuantity.provenance : t("rate.transport.provenance.derived", { term: term.equationTerm });
  return <tr data-transport-term={term.id}>
    <th scope="row">{t(TERM_LABELS[term.id])}</th><td><code>{term.equation}</code></td>
    <td>{term.status === "available" ? t("rate.transport.available") : t("rate.transport.unavailable", { inputs: missing })}</td>
    <td>{term.status === "available" ? `${formatTransportTime(term.value)} s` : "—"}</td>
    <td>{t(`rate.parameterType.${term.type}`)} · {provenance}</td>
  </tr>;
}

function AggregateSummary({ transport }: { transport: Readonly<TransportTimeResult> }) {
  const { t } = useI18n();
  const hasAvailableComponent = transport.terms.some(({ status }) => status === "available");
  const calculated = transport.complete
    ? transport.aggregates.calculatedTotal
    : hasAvailableComponent && Number.isFinite(transport.availableSum) && transport.availableSum > 0
      ? { ...transport.aggregates.calculatedTotal, status: "available" as const, value: transport.availableSum }
      : transport.aggregates.calculatedTotal;
  const items = [
    aggregateCard("electrical", t("rate.transport.electricalAggregate"), transport.aggregates.electrical, t("rate.transport.provenance.electrical"), t),
    aggregateCard("diffusive", t("rate.transport.diffusiveAggregate"), transport.aggregates.diffusive, t("rate.transport.provenance.diffusive"), t),
    aggregateCard("calculated", t(transport.complete ? "rate.transport.calculatedTotal" : "rate.transport.partialSum"), calculated, t("rate.transport.provenance.total"), t),
  ];
  return <section className="tool-section"><h2>{t("rate.transport.aggregatesTitle")}</h2><ResultCards kind="user" items={items} /></section>;
}

function CharacteristicSummary({ analysis }: { analysis: Readonly<CompletedTransportAnalysis> }) {
  const { t } = useI18n();
  const kinetic = analysis.transport.terms.find(({ id }) => id === "kinetic");
  const fitted = analysis.fittedTau;
  const fittedAvailable = Boolean(fitted && Number.isFinite(fitted.value) && fitted.value > 0);
  const items: ReadonlyArray<Readonly<RateResultCardItem>> = [
    { id: "fitted-total", label: t("rate.transport.fittedTau"), value: fittedAvailable && fitted ? formatTransportTime(fitted.value * (fitted.unit === "h" ? 3600 : 1)) : t("rate.analysis.notEstimable"), unit: fittedAvailable ? "s" : undefined, type: "fitted", detail: t("rate.transport.provenance.fitted") },
    aggregateCard("electrical", t("rate.transport.electricalAggregate"), analysis.transport.aggregates.electrical, t("rate.transport.provenance.electrical"), t),
    aggregateCard("diffusive", t("rate.transport.diffusiveAggregate"), analysis.transport.aggregates.diffusive, t("rate.transport.provenance.diffusive"), t),
    { id: "kinetic", label: "t_c", value: kinetic?.status === "available" ? formatTransportTime(kinetic.value) : t("rate.analysis.notEstimable"), unit: kinetic?.status === "available" ? "s" : undefined, type: kinetic?.type ?? "user-input", detail: kinetic?.status === "available" ? analysis.input.kineticTime?.provenance : undefined },
    aggregateCard("calculated", t("rate.transport.calculatedTotal"), analysis.transport.aggregates.calculatedTotal, t("rate.transport.provenance.total"), t),
  ];
  return <section className="tool-section"><h2>{t("rate.characteristicTime.title")}</h2><ResultCards kind="user" items={items} /></section>;
}

function aggregateCard(id: string, label: string, aggregate: Readonly<{ status: "available" | "unavailable"; value?: number }>, provenance: string, t: TransportTranslator): RateResultCardItem {
  return { id, label, value: aggregate.status === "available" && aggregate.value !== undefined ? formatTransportTime(aggregate.value) : t("rate.analysis.notEstimable"), unit: aggregate.status === "available" ? "s" : undefined, type: "derived", detail: provenance };
}
