import { useRef } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { EnergyCapacityUnit, EnergyNormalizationBasis } from "../analysis/energyPower";

export interface EnergySummaryDraft {
  readonly id: string;
  readonly sampleName: string;
  readonly capacity: number | null;
  readonly capacityUnit: EnergyCapacityUnit;
  readonly averageVoltage: number | null;
  readonly dischargeTime: number | null;
  readonly dischargeTimeUnit: "s" | "min" | "h";
  readonly basis: EnergyNormalizationBasis;
  readonly massG: number | null;
  readonly volumeCm3: number | null;
}

export const createEnergySummaryDraft = (id = "energy-summary-1"): EnergySummaryDraft => ({
  id, sampleName: "", capacity: null, capacityUnit: "mAh-g-1", averageVoltage: null,
  dischargeTime: null, dischargeTimeUnit: "h", basis: "active-material", massG: null, volumeCm3: null,
});

export function EnergySummaryInput({ samples, onChange, onLoadExample }: {
  samples: ReadonlyArray<Readonly<EnergySummaryDraft>>;
  onChange: (samples: EnergySummaryDraft[]) => void;
  onLoadExample: () => void;
}) {
  const { t } = useI18n();
  const sequence = useRef(samples.length);
  const replace = <K extends keyof EnergySummaryDraft>(id: string, key: K, value: EnergySummaryDraft[K]) =>
    onChange(samples.map((sample) => sample.id === id ? { ...sample, [key]: value } : { ...sample }));
  const number = (raw: string) => raw.trim() === "" ? null : Number(raw);
  function duplicate(sample: Readonly<EnergySummaryDraft>) {
    sequence.current += 1;
    onChange([...samples.map((item) => ({ ...item })), {
      ...sample, id: `energy-summary-${sequence.current}`,
      sampleName: sample.sampleName ? `${sample.sampleName} ${t("rate.energy.input.copySuffix")}` : "",
    }]);
  }
  return <section className="tool-section energy-summary-input">
    <h2>{t("rate.energy.input.summaryTitle")}</h2>
    <div className="energy-summary-list">{samples.map((sample, index) => <article className="energy-summary-sample" key={sample.id} aria-labelledby={`${sample.id}-heading`}>
      <div className="energy-sample-header"><h3 id={`${sample.id}-heading`}>{sample.sampleName || t("rate.energy.input.sampleNumber", { number: index + 1 })}</h3><div>
        <button type="button" aria-label={`${t("rate.energy.input.duplicate")} ${sample.sampleName || index + 1}`} onClick={() => duplicate(sample)}>{t("rate.energy.input.duplicate")}</button>
        <button type="button" aria-label={`${t("rate.energy.input.delete")} ${sample.sampleName || index + 1}`} disabled={samples.length === 1} onClick={() => onChange(samples.filter(({ id }) => id !== sample.id).map((item) => ({ ...item })))}>{t("rate.energy.input.delete")}</button>
      </div></div>
      <div className="energy-input-grid">
        <label>{t("rate.energy.input.sampleName")}<input value={sample.sampleName} onChange={(event) => replace(sample.id, "sampleName", event.target.value)} /></label>
        <label>{t("rate.energy.input.capacity")}<input type="number" value={sample.capacity ?? ""} onChange={(event) => replace(sample.id, "capacity", number(event.target.value))} /></label>
        <label>{t("rate.energy.input.capacityUnit")}<select value={sample.capacityUnit} onChange={(event) => replace(sample.id, "capacityUnit", event.target.value as EnergyCapacityUnit)}><option value="mAh-g-1">mAh g⁻¹</option><option value="Ah-kg-1">Ah kg⁻¹</option><option value="mAh">mAh</option></select></label>
        <label>{t("rate.energy.input.averageVoltage")}<input type="number" value={sample.averageVoltage ?? ""} onChange={(event) => replace(sample.id, "averageVoltage", number(event.target.value))} /></label>
        <label>{t("rate.energy.input.dischargeTime")}<input type="number" value={sample.dischargeTime ?? ""} onChange={(event) => replace(sample.id, "dischargeTime", number(event.target.value))} /></label>
        <label>{t("rate.energy.input.timeUnit")}<select value={sample.dischargeTimeUnit} onChange={(event) => replace(sample.id, "dischargeTimeUnit", event.target.value as "s" | "min" | "h")}><option value="s">s</option><option value="min">min</option><option value="h">h</option></select></label>
        <label>{t("rate.energy.input.basis")}<select value={sample.basis} onChange={(event) => replace(sample.id, "basis", event.target.value as EnergyNormalizationBasis)}><BasisOptions /></select></label>
        <label>{t("rate.energy.input.mass")}<input type="number" value={sample.massG ?? ""} onChange={(event) => replace(sample.id, "massG", number(event.target.value))} /></label>
        <label>{t("rate.energy.input.volume")}<input type="number" value={sample.volumeCm3 ?? ""} onChange={(event) => replace(sample.id, "volumeCm3", number(event.target.value))} /></label>
      </div>
      <p className="energy-input-note">{t("rate.energy.input.volumeHelp")}</p>
    </article>)}</div>
    <div className="rate-manual-toolbar">
      <button type="button" onClick={() => { sequence.current += 1; onChange([...samples.map((item) => ({ ...item })), createEnergySummaryDraft(`energy-summary-${sequence.current}`)]); }}>{t("rate.energy.input.add")}</button>
      <button type="button" onClick={() => onChange([createEnergySummaryDraft()])}>{t("rate.energy.input.clear")}</button>
      <button type="button" onClick={onLoadExample}>{t("rate.energy.input.loadExample")}</button>
    </div>
  </section>;
}

export function BasisOptions() {
  const { t } = useI18n();
  return <><option value="active-material">{t("rate.energy.basis.active-material")}</option><option value="electrode">{t("rate.energy.basis.electrode")}</option><option value="device">{t("rate.energy.basis.device")}</option></>;
}
