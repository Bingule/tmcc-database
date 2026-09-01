import { useI18n } from "../../../i18n/I18nProvider";
import type { EnergyPowerResult, RagonePoint } from "../analysis/energyPower";
import { ExportToolbar } from "./ExportToolbar";
import { RateChartPanel } from "./RateChartPanel";
import { ResultCards } from "./ResultCards";

const basisColors = { "active-material": "#1f6f78", electrode: "#b36b2c", device: "#596275" } as const;

export function EnergyPowerResults({ results, sampleIds, ragone, kind, csv }: {
  results: ReadonlyArray<Readonly<EnergyPowerResult>>;
  sampleIds: ReadonlyArray<string>;
  ragone: ReadonlyArray<Readonly<RagonePoint>>;
  kind: "example" | "user";
  csv: Readonly<{ original: string; results: string; ragone: string }>;
}) {
  const { t } = useI18n();
  const successes = results.filter((result): result is Extract<EnergyPowerResult, { status: "success" }> => result.status === "success");
  const failures = results.filter((result): result is Extract<EnergyPowerResult, { status: "failure" }> => result.status === "failure");
  const series = (["active-material", "electrode", "device"] as const).flatMap((basis) => {
    const points = ragone.filter((point) => point.normalizationBasis === basis);
    return points.length ? [{ id: `ragone-${basis}`, label: t(`rate.energy.basis.${basis}`), color: basisColors[basis], mode: "points" as const, points: points.map((point) => ({ x: point.powerWKg, y: point.energyWhKg, accessibilityLabel: `${point.sampleId}: ${point.powerWKg} W kg⁻¹, ${point.energyWhKg} Wh kg⁻¹` })) }] : [];
  });
  return <section className="energy-results-workspace">
    <ResultCards kind={kind} items={successes.flatMap((result) => [
      { id: `${result.sampleId}-energy`, label: `${result.sampleId} · ${t("rate.energy.result.energy")}`, value: format(result.specificEnergyWhKg), unit: "Wh kg^-1", type: "derived" as const, detail: t(`rate.energy.basis.${result.normalizationBasis}`) },
      { id: `${result.sampleId}-power`, label: `${result.sampleId} · ${t("rate.energy.result.power")}`, value: result.specificPowerWKg === null ? "—" : format(result.specificPowerWKg), unit: "W kg^-1", type: "derived" as const, detail: t(`rate.energy.basis.${result.normalizationBasis}`) },
      ...(result.volumetricEnergyWhL === null ? [] : [{ id: `${result.sampleId}-vol-energy`, label: `${result.sampleId} · ${t("rate.energy.result.volEnergy")}`, value: format(result.volumetricEnergyWhL), unit: "Wh L^-1", type: "derived" as const }]),
      ...(result.volumetricPowerWL === null ? [] : [{ id: `${result.sampleId}-vol-power`, label: `${result.sampleId} · ${t("rate.energy.result.volPower")}`, value: format(result.volumetricPowerWL), unit: "W L^-1", type: "derived" as const }]),
    ])} />
    {failures.length ? <section className="tool-section" role="alert"><h2>{t("rate.energy.result.failures")}</h2><ul>{results.flatMap((result, index) => result.status === "failure" ? [<li key={`${result.code}-${index}`}><strong>{sampleIds[index] ?? `#${index + 1}`}</strong>: {t(`rate.energy.error.${result.code}`)}{result.pointIds.length ? ` (${result.pointIds.join(", ")})` : ""}</li>] : [])}</ul></section> : null}
    {series.length ? <><RateChartPanel title={t("rate.energy.ragone.title")} xLabel={t("rate.energy.ragone.x")} yLabel={t("rate.energy.ragone.y")} xScale="log10" yScale="log10" exportId="energy-ragone-chart" metadata={t("rate.energy.ragone.metadata")} series={series} /><p className="tool-validation">{t("rate.energy.ragone.basisWarning")}</p></> : null}
    <ExportToolbar csvItems={[
      { id: "energy-original", label: t("rate.energy.export.original"), filename: "energy-power-original.csv", csv: csv.original },
      { id: "energy-results", label: t("rate.energy.export.results"), filename: "energy-power-results.csv", csv: csv.results },
      { id: "energy-ragone", label: t("rate.energy.export.ragone"), filename: "energy-power-ragone.csv", csv: csv.ragone },
    ]} figureExportId={series.length ? "energy-ragone-chart" : undefined} figureFilename="energy-power-ragone" />
  </section>;
}

function format(value: number) { return Number(value.toPrecision(6)).toString(); }
