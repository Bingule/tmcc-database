import type { TranslationKey } from "../../../locales/en";
import type {
  TaggedTransportQuantity,
  TimeUnit,
  TransportInputKey,
  TransportTermId,
  TransportTimeInput,
  TransportTimeResult,
  TransportUnavailabilityReason,
  TransportUnit,
} from "../analysis/transportTimes";

export type TransportWorkspaceMode = "transport" | "characteristic";
export type SourceType = "user-input" | "assumed";
export type TransportTranslator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface FieldDefinition<Unit extends TransportUnit = TransportUnit> {
  readonly key: TransportInputKey;
  readonly symbol: string;
  readonly label: TranslationKey;
  readonly unit: Unit;
}

export interface FieldValue {
  readonly text: string;
  readonly type: SourceType;
}

export interface FormState {
  readonly fields: Readonly<Record<TransportInputKey, Readonly<FieldValue>>>;
  readonly fittedTau: Readonly<FieldValue>;
}

export interface CompletedTransportAnalysis {
  readonly origin: "example" | "user";
  readonly input: Readonly<TransportTimeInput>;
  readonly fittedTau?: Readonly<TaggedTransportQuantity<TimeUnit>>;
  readonly transport: Readonly<TransportTimeResult>;
}

export const FIELD_DEFINITIONS: ReadonlyArray<Readonly<FieldDefinition>> = Object.freeze([
  Object.freeze({ key: "electrodeThickness", symbol: "L_E", label: "rate.transport.electrodeThickness", unit: "um" }),
  Object.freeze({ key: "separatorThickness", symbol: "L_S", label: "rate.transport.separatorThickness", unit: "um" }),
  Object.freeze({ key: "activeMaterialLength", symbol: "L_AM", label: "rate.transport.activeMaterialLength", unit: "um" }),
  Object.freeze({ key: "effectiveVolumetricCapacitance", symbol: "C_V,eff", label: "rate.transport.volumetricCapacitance", unit: "F-cm-3" }),
  Object.freeze({ key: "electrodeConductivity", symbol: "sigma_E", label: "rate.transport.electrodeConductivity", unit: "S-m-1" }),
  Object.freeze({ key: "bulkElectrolyteConductivity", symbol: "sigma_BL", label: "rate.transport.electrolyteConductivity", unit: "S-m-1" }),
  Object.freeze({ key: "electrodePorosity", symbol: "P_E", label: "rate.transport.electrodePorosity", unit: "fraction" }),
  Object.freeze({ key: "separatorPorosity", symbol: "P_S", label: "rate.transport.separatorPorosity", unit: "fraction" }),
  Object.freeze({ key: "bulkElectrolyteDiffusivity", symbol: "D_BL", label: "rate.transport.electrolyteDiffusivity", unit: "m2-s-1" }),
  Object.freeze({ key: "activeMaterialDiffusivity", symbol: "D_AM", label: "rate.transport.activeMaterialDiffusivity", unit: "m2-s-1" }),
  Object.freeze({ key: "kineticTime", symbol: "t_c", label: "rate.transport.kineticTime", unit: "s" }),
]);

export const TERM_LABELS: Readonly<Record<TransportTermId, TranslationKey>> = Object.freeze({
  "electrode-electronic": "rate.transport.term.electrodeElectronic",
  "pore-ionic-electrical": "rate.transport.term.poreIonicElectrical",
  "pore-diffusion": "rate.transport.term.poreDiffusion",
  "separator-ionic-electrical": "rate.transport.term.separatorIonicElectrical",
  "separator-diffusion": "rate.transport.term.separatorDiffusion",
  "active-material-diffusion": "rate.transport.term.activeMaterialDiffusion",
  kinetic: "rate.transport.term.kinetic",
});

export function buildTransportInput(form: Readonly<FormState>, t: TransportTranslator): TransportTimeInput {
  const entries = FIELD_DEFINITIONS.flatMap((definition) => {
    const field = form.fields[definition.key];
    const value = parseOptionalNumber(field.text);
    if (value === undefined) return [];
    const provenance = t(field.type === "assumed" ? "rate.transport.provenance.example" : "rate.transport.provenance.user");
    return [[definition.key, { value, unit: definition.unit, type: field.type, provenance }]] as const;
  });
  return Object.fromEntries(entries) as TransportTimeInput;
}

export function buildFittedTau(
  form: Readonly<FormState>,
  t: TransportTranslator,
): TaggedTransportQuantity<"h"> | undefined {
  const value = parseOptionalNumber(form.fittedTau.text);
  return value === undefined ? undefined : {
    value,
    unit: "h",
    type: form.fittedTau.type,
    provenance: t(form.fittedTau.type === "assumed"
      ? "rate.transport.provenance.example"
      : "rate.transport.provenance.user"),
  };
}

export function emptyTransportForm(): FormState {
  return {
    fields: Object.fromEntries(FIELD_DEFINITIONS.map(({ key }) => [key, { text: "", type: "user-input" }])) as Record<TransportInputKey, FieldValue>,
    fittedTau: { text: "", type: "user-input" },
  };
}

export function exampleTransportForm(): FormState {
  const values: Readonly<Record<TransportInputKey, string>> = {
    electrodeThickness: "100",
    separatorThickness: "25",
    activeMaterialLength: "3",
    effectiveVolumetricCapacitance: "1000",
    electrodeConductivity: "100",
    bulkElectrolyteConductivity: "0.5",
    electrodePorosity: "0.5",
    separatorPorosity: "0.4",
    bulkElectrolyteDiffusivity: "3e-10",
    activeMaterialDiffusivity: "1e-14",
    kineticTime: "25",
  };
  return {
    fields: Object.fromEntries(FIELD_DEFINITIONS.map(({ key }) => [key, { text: values[key], type: "assumed" }])) as Record<TransportInputKey, FieldValue>,
    fittedTau: { text: "0.5", type: "assumed" },
  };
}

export function fieldDefinition(key: TransportInputKey): Readonly<FieldDefinition> {
  const definition = FIELD_DEFINITIONS.find(({ key: candidate }) => candidate === key);
  if (!definition) throw new Error(`Missing UI definition for ${key}.`);
  return definition;
}

export function displayTransportUnit(unit: TransportUnit): string {
  switch (unit) {
    case "um": return "µm";
    case "nm": return "nm";
    case "m": return "m";
    case "F-cm-3": return "F cm^-3";
    case "F-m-3": return "F m^-3";
    case "S-m-1": return "S m^-1";
    case "m2-s-1": return "m^2 s^-1";
    case "fraction": return "1";
    case "s": return "s";
    case "h": return "h";
  }
}

export function formatTransportTime(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const absolute = Math.abs(value);
  return absolute >= 1e4 || absolute < 1e-3
    ? value.toExponential(3)
    : Number(value.toPrecision(5)).toString();
}

export function formatTransportPercent(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

export function transportUnavailabilityReasonText(
  reason: TransportUnavailabilityReason,
  t: TransportTranslator,
): string {
  switch (reason) {
    case "numerical-overflow": return t("rate.transport.reason.numericalOverflow");
    case "numerical-underflow": return t("rate.transport.reason.numericalUnderflow");
    case "no-available-terms": return t("rate.transport.reason.noAvailableTerms");
    case "unavailable-terms": return t("rate.transport.reason.unavailableTerms");
    case "missing-inputs": return t("rate.transport.reason.missingInputs");
    case "invalid-inputs": return t("rate.transport.reason.invalidInputs");
    case "missing-and-invalid-inputs": return t("rate.transport.reason.missingAndInvalidInputs");
  }
}

function parseOptionalNumber(text: string): number | undefined {
  return text.trim() === "" ? undefined : Number(text);
}
