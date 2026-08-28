import { useI18n } from "../../../i18n/I18nProvider";
import { getTransportInputDefinition, type TransportInputKey } from "../analysis/transportTimes";
import {
  displayTransportUnit,
  FIELD_DEFINITIONS,
  type FieldValue,
  type FormState,
} from "./transportTimePresentation";

export function TransportInputForm({
  form,
  onFieldChange,
  onFittedTauChange,
  onCalculate,
  onTryExample,
  onClear,
}: {
  form: Readonly<FormState>;
  onFieldChange: (key: TransportInputKey, text: string) => void;
  onFittedTauChange: (text: string) => void;
  onCalculate: () => void;
  onTryExample: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return <section className="tool-section rate-transport-inputs">
    <h2>{t("rate.transport.inputTitle")}</h2>
    <p>{t("rate.transport.inputHelp")}</p>
    <div className="rate-unit-controls">
      <TransportInputField
        name="fittedTau"
        label={t("rate.transport.fittedTau")}
        unit="h"
        value={form.fittedTau}
        provenance={t(form.fittedTau.type === "assumed"
          ? "rate.transport.provenance.example"
          : "rate.transport.provenance.user")}
        onChange={onFittedTauChange}
      />
      {FIELD_DEFINITIONS.map((definition) => <TransportInputField
        key={definition.key}
        name={definition.key}
        label={t(definition.label)}
        unit={displayTransportUnit(definition.unit)}
      value={form.fields[definition.key]}
      maximum={getTransportInputDefinition(definition.key).bounds.inclusiveMaximum}
        provenance={t(form.fields[definition.key].type === "assumed"
          ? "rate.transport.provenance.example"
          : "rate.transport.provenance.user")}
        onChange={(text) => onFieldChange(definition.key, text)}
      />)}
    </div>
    <div className="rate-input-actions">
      <button type="button" onClick={onCalculate}>{t("rate.transport.calculate")}</button>
      <button type="button" onClick={onTryExample}>{t("rate.transport.tryExample")}</button>
      <button type="button" onClick={onClear}>{t("rate.transport.clear")}</button>
    </div>
  </section>;
}

function TransportInputField({
  name,
  label,
  unit,
  value,
  maximum,
  provenance,
  onChange,
}: {
  name: string;
  label: string;
  unit: string;
  value: Readonly<FieldValue>;
  maximum?: number;
  provenance: string;
  onChange: (text: string) => void;
}) {
  const { t } = useI18n();
  return <label>
    <span>{label} ({unit})</span>
    <input
      name={name}
      type="number"
      inputMode="decimal"
      min="0"
      max={maximum}
      step="any"
      value={value.text}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
    <small>{t(`rate.parameterType.${value.type}`)} · {provenance}</small>
  </label>;
}
