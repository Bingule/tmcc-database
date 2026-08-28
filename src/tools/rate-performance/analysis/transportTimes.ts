import type { RateModelParameterType } from "../models/types";

export type LengthUnit = "m" | "um" | "nm";
export type VolumetricCapacitanceUnit = "F-m-3" | "F-cm-3";
export type ConductivityUnit = "S-m-1";
export type DiffusivityUnit = "m2-s-1";
export type PorosityUnit = "fraction";
export type TimeUnit = "s" | "h";
export type TransportUnit =
  | LengthUnit
  | VolumetricCapacitanceUnit
  | ConductivityUnit
  | DiffusivityUnit
  | PorosityUnit
  | TimeUnit;

export interface TaggedTransportQuantity<Unit extends TransportUnit = TransportUnit> {
  readonly value: number;
  readonly unit: Unit;
  readonly type: RateModelParameterType;
  readonly provenance: string;
}

export interface TransportTimeInput {
  readonly electrodeThickness?: Readonly<TaggedTransportQuantity<LengthUnit>>;
  readonly separatorThickness?: Readonly<TaggedTransportQuantity<LengthUnit>>;
  readonly activeMaterialLength?: Readonly<TaggedTransportQuantity<LengthUnit>>;
  readonly effectiveVolumetricCapacitance?: Readonly<TaggedTransportQuantity<VolumetricCapacitanceUnit>>;
  readonly electrodeConductivity?: Readonly<TaggedTransportQuantity<ConductivityUnit>>;
  readonly bulkElectrolyteConductivity?: Readonly<TaggedTransportQuantity<ConductivityUnit>>;
  readonly electrodePorosity?: Readonly<TaggedTransportQuantity<PorosityUnit>>;
  readonly separatorPorosity?: Readonly<TaggedTransportQuantity<PorosityUnit>>;
  readonly bulkElectrolyteDiffusivity?: Readonly<TaggedTransportQuantity<DiffusivityUnit>>;
  readonly activeMaterialDiffusivity?: Readonly<TaggedTransportQuantity<DiffusivityUnit>>;
  readonly kineticTime?: Readonly<TaggedTransportQuantity<TimeUnit>>;
}

export type TransportInputKey = keyof TransportTimeInput;

export type TransportTermId =
  | "electrode-electronic"
  | "pore-ionic-electrical"
  | "pore-diffusion"
  | "separator-ionic-electrical"
  | "separator-diffusion"
  | "active-material-diffusion"
  | "kinetic";

export type TransportTermGroup = "electrical" | "diffusive" | "kinetic";

interface TransportTermBase {
  readonly id: TransportTermId;
  readonly equationTerm: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly group: TransportTermGroup;
  readonly equation: string;
  readonly unit: "s";
  readonly type: RateModelParameterType;
  readonly provenance: string;
  readonly missingInputs: ReadonlyArray<TransportInputKey>;
}

export interface AvailableTransportTerm extends TransportTermBase {
  readonly status: "available";
  readonly value: number;
  readonly missingInputs: readonly [];
}

export interface UnavailableTransportTerm extends TransportTermBase {
  readonly status: "unavailable";
  readonly missingInputs: ReadonlyArray<TransportInputKey>;
}

export type TransportTerm = AvailableTransportTerm | UnavailableTransportTerm;

export interface TransportAggregate {
  readonly id: "electrical" | "diffusive" | "calculated-total";
  readonly status: "available" | "unavailable";
  readonly value?: number;
  readonly unit: "s";
  readonly type: "derived";
  readonly provenance: string;
  readonly missingTermIds: ReadonlyArray<TransportTermId>;
}

export interface TransportRelativeContribution {
  readonly termId: TransportTermId;
  readonly value: number;
  readonly unit: "s";
  readonly percent: number;
  readonly type: "derived";
  readonly provenance: string;
}

export interface TransportTimeResult {
  readonly terms: ReadonlyArray<Readonly<TransportTerm>>;
  readonly aggregates: {
    readonly electrical: Readonly<TransportAggregate>;
    readonly diffusive: Readonly<TransportAggregate>;
    readonly calculatedTotal: Readonly<TransportAggregate>;
  };
  readonly availableSum: number;
  readonly unit: "s";
  readonly complete: boolean;
  readonly invalidInputs: ReadonlyArray<TransportInputKey>;
  readonly relativeContributions?: ReadonlyArray<Readonly<TransportRelativeContribution>>;
}

interface TermDefinition {
  readonly id: TransportTermId;
  readonly equationTerm: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly group: TransportTermGroup;
  readonly equation: string;
  readonly required: ReadonlyArray<TransportInputKey>;
  readonly calculate: (values: Readonly<Record<TransportInputKey, number>>) => number;
}

function defineTerm(definition: TermDefinition): Readonly<TermDefinition> {
  return Object.freeze(definition);
}

const INPUT_KEYS: ReadonlyArray<TransportInputKey> = Object.freeze([
  "electrodeThickness",
  "separatorThickness",
  "activeMaterialLength",
  "effectiveVolumetricCapacitance",
  "electrodeConductivity",
  "bulkElectrolyteConductivity",
  "electrodePorosity",
  "separatorPorosity",
  "bulkElectrolyteDiffusivity",
  "activeMaterialDiffusivity",
  "kineticTime",
]);

const TERM_DEFINITIONS: ReadonlyArray<Readonly<TermDefinition>> = Object.freeze([
  defineTerm({
    id: "electrode-electronic",
    equationTerm: 1,
    group: "electrical",
    equation: "L_E^2 C_V,eff / (2 sigma_E)",
    required: Object.freeze(["electrodeThickness", "effectiveVolumetricCapacitance", "electrodeConductivity"]),
    calculate: (v) => v.electrodeThickness ** 2 * v.effectiveVolumetricCapacitance / (2 * v.electrodeConductivity),
  }),
  defineTerm({
    id: "pore-ionic-electrical",
    equationTerm: 2,
    group: "electrical",
    equation: "L_E^2 C_V,eff / (2 sigma_BL P_E^(3/2))",
    required: Object.freeze(["electrodeThickness", "effectiveVolumetricCapacitance", "bulkElectrolyteConductivity", "electrodePorosity"]),
    calculate: (v) => v.electrodeThickness ** 2 * v.effectiveVolumetricCapacitance
      / (2 * v.bulkElectrolyteConductivity * v.electrodePorosity ** 1.5),
  }),
  defineTerm({
    id: "pore-diffusion",
    equationTerm: 3,
    group: "diffusive",
    equation: "L_E^2 / (D_BL P_E^(3/2))",
    required: Object.freeze(["electrodeThickness", "bulkElectrolyteDiffusivity", "electrodePorosity"]),
    calculate: (v) => v.electrodeThickness ** 2
      / (v.bulkElectrolyteDiffusivity * v.electrodePorosity ** 1.5),
  }),
  defineTerm({
    id: "separator-ionic-electrical",
    equationTerm: 4,
    group: "electrical",
    equation: "L_E L_S C_V,eff / (sigma_BL P_S^(3/2))",
    required: Object.freeze(["electrodeThickness", "separatorThickness", "effectiveVolumetricCapacitance", "bulkElectrolyteConductivity", "separatorPorosity"]),
    calculate: (v) => v.electrodeThickness * v.separatorThickness * v.effectiveVolumetricCapacitance
      / (v.bulkElectrolyteConductivity * v.separatorPorosity ** 1.5),
  }),
  defineTerm({
    id: "separator-diffusion",
    equationTerm: 5,
    group: "diffusive",
    equation: "L_S^2 / (D_BL P_S^(3/2))",
    required: Object.freeze(["separatorThickness", "bulkElectrolyteDiffusivity", "separatorPorosity"]),
    calculate: (v) => v.separatorThickness ** 2
      / (v.bulkElectrolyteDiffusivity * v.separatorPorosity ** 1.5),
  }),
  defineTerm({
    id: "active-material-diffusion",
    equationTerm: 6,
    group: "diffusive",
    equation: "L_AM^2 / D_AM",
    required: Object.freeze(["activeMaterialLength", "activeMaterialDiffusivity"]),
    calculate: (v) => v.activeMaterialLength ** 2 / v.activeMaterialDiffusivity,
  }),
  defineTerm({
    id: "kinetic",
    equationTerm: 7,
    group: "kinetic",
    equation: "t_c",
    required: Object.freeze(["kineticTime"]),
    calculate: (v) => v.kineticTime,
  }),
]);

const ELECTRICAL_TERM_IDS: ReadonlyArray<TransportTermId> = Object.freeze([
  "electrode-electronic",
  "pore-ionic-electrical",
  "separator-ionic-electrical",
]);
const DIFFUSIVE_TERM_IDS: ReadonlyArray<TransportTermId> = Object.freeze([
  "pore-diffusion",
  "separator-diffusion",
  "active-material-diffusion",
]);

/**
 * Evaluate the seven Tian et al. (2019), Eq. 6a terms in SI units.
 * Input quantities retain their declared unit, type, and provenance; outputs are seconds.
 */
export function calculateTransportTimes(input: Readonly<TransportTimeInput>): TransportTimeResult {
  const invalidInputs = INPUT_KEYS.filter((key) => input[key] !== undefined && !isUsableInput(key, input[key]));
  const values = {} as Record<TransportInputKey, number>;
  for (const key of INPUT_KEYS) {
    const quantity = input[key];
    if (quantity && !invalidInputs.includes(key)) values[key] = toSi(quantity);
  }

  const terms = TERM_DEFINITIONS.map((definition): TransportTerm => {
    const missingInputs = definition.required.filter((key) => values[key] === undefined);
    const provenance = definition.id === "kinetic"
      ? `${input.kineticTime?.provenance ?? "User-supplied kinetic time"}; Tian et al. (2019), Eq. 6a term 7`
      : `Derived from Tian et al. (2019), Eq. 6a term ${definition.equationTerm} using SI-converted inputs.`;
    const type = definition.id === "kinetic" ? input.kineticTime?.type ?? "user-input" : "derived";

    if (missingInputs.length > 0) {
      return {
        ...definitionMetadata(definition, type, provenance),
        status: "unavailable",
        missingInputs,
      };
    }

    const value = definition.calculate(values);
    if (!Number.isFinite(value) || value <= 0) {
      return {
        ...definitionMetadata(definition, type, provenance),
        status: "unavailable",
        missingInputs: definition.required,
      };
    }
    return {
      ...definitionMetadata(definition, type, provenance),
      status: "available",
      value,
      missingInputs: [],
    };
  });

  const available = terms.filter((term): term is AvailableTransportTerm => term.status === "available");
  const availableSum = available.reduce((sum, term) => sum + term.value, 0);
  const complete = available.length === TERM_DEFINITIONS.length
    && available.every(({ value }) => Number.isFinite(value) && value > 0)
    && Number.isFinite(availableSum)
    && availableSum > 0;
  const electrical = aggregateTerms("electrical", terms, ELECTRICAL_TERM_IDS, "Tian et al. (2019), Eqs. 5c and 6a electrical terms 1, 2, and 4.");
  const diffusive = aggregateTerms("diffusive", terms, DIFFUSIVE_TERM_IDS, "Tian et al. (2019), Eqs. 5b and 6a diffusive terms 3, 5, and 6.");
  const calculatedTotal = aggregateTerms(
    "calculated-total",
    terms,
    TERM_DEFINITIONS.map(({ id }) => id),
    "Sum of all seven Tian et al. (2019), Eq. 6a components.",
  );

  return {
    terms,
    aggregates: { electrical, diffusive, calculatedTotal },
    availableSum,
    unit: "s",
    complete,
    invalidInputs,
    relativeContributions: complete
      ? available.map((term) => ({
        termId: term.id,
        value: term.value,
        unit: "s",
        percent: term.value / availableSum * 100,
        type: "derived",
        provenance: "Relative share of the complete positive finite Tian et al. (2019), Eq. 6a decomposition.",
      }))
      : undefined,
  };
}

export type UnresolvedTimeResult =
  | {
    readonly status: "unavailable";
    readonly missingInputs: readonly ["fittedTau"];
    readonly unit: "s";
    readonly type: "derived";
    readonly provenance: string;
  }
  | {
    readonly status: "available";
    readonly fittedTotal: number;
    readonly availableComponentSum: number;
    readonly difference: number;
    readonly unresolvedContribution: number | null;
    readonly consistencyWarning: boolean;
    readonly warningCode?: "components-exceed-fitted-total";
    readonly includedComponentIds: ReadonlyArray<TransportTermId>;
    readonly unit: "s";
    readonly type: "derived";
    readonly provenance: string;
  };

/** Compare a fitted total with the sum of whichever Eq. 6a components are available. */
export function calculateUnresolvedTime(
  fittedTau: Readonly<TaggedTransportQuantity<TimeUnit>> | undefined,
  components: ReadonlyArray<Readonly<TransportTerm>>,
): UnresolvedTimeResult {
  const provenance = "Difference between fitted tau and the sum of available Tian et al. (2019), Eq. 6a components.";
  if (!fittedTau || !isUsableQuantity(fittedTau)) {
    return { status: "unavailable", missingInputs: ["fittedTau"], unit: "s", type: "derived", provenance };
  }
  const fittedTotal = toSi(fittedTau);
  const available = components.filter((component): component is AvailableTransportTerm => component.status === "available");
  const availableComponentSum = available.reduce((sum, component) => sum + component.value, 0);
  const difference = fittedTotal - availableComponentSum;
  const consistencyWarning = difference < 0;
  return {
    status: "available",
    fittedTotal,
    availableComponentSum,
    difference,
    unresolvedContribution: consistencyWarning ? null : difference,
    consistencyWarning,
    ...(consistencyWarning ? { warningCode: "components-exceed-fitted-total" as const } : {}),
    includedComponentIds: available.map(({ id }) => id),
    unit: "s",
    type: "derived",
    provenance,
  };
}

export interface TransportSensitivityOptions {
  readonly minimumFactor: number;
  readonly maximumFactor: number;
  readonly steps: number;
}

export interface TransportSensitivityPoint {
  readonly factor: number;
  readonly inputValue: number;
  readonly variedInput: Readonly<TransportTimeInput>;
  readonly result: Readonly<TransportTimeResult>;
  readonly totalSeconds?: number;
}

export interface TransportSensitivitySeries {
  readonly method: "deterministic-one-at-a-time";
  readonly parameter: TransportInputKey;
  readonly baseline: Readonly<TaggedTransportQuantity>;
  readonly range: Readonly<TransportSensitivityOptions>;
  readonly points: ReadonlyArray<Readonly<TransportSensitivityPoint>>;
  readonly interpretation: string;
}

const DEFAULT_SENSITIVITY: Readonly<TransportSensitivityOptions> = Object.freeze({
  minimumFactor: 0.5,
  maximumFactor: 1.5,
  steps: 5,
});

/** Deterministic OAT sweep. No causal or mechanistic conclusion is inferred. */
export function createTransportSensitivitySeries(
  input: Readonly<TransportTimeInput>,
  parameter: TransportInputKey,
  options: Readonly<TransportSensitivityOptions> = DEFAULT_SENSITIVITY,
): TransportSensitivitySeries {
  const baseline = input[parameter];
  if (!baseline || !isUsableInput(parameter, baseline)) {
    throw new RangeError(`${parameter} requires a positive finite baseline before sensitivity analysis.`);
  }
  if (!Number.isFinite(options.minimumFactor) || options.minimumFactor <= 0
    || !Number.isFinite(options.maximumFactor) || options.maximumFactor < options.minimumFactor
    || !Number.isInteger(options.steps) || options.steps < 2 || options.steps > 101) {
    throw new RangeError("Sensitivity range must be positive, ordered, and contain 2 to 101 integer steps.");
  }

  const points = Array.from({ length: options.steps }, (_, index): TransportSensitivityPoint => {
    const fraction = index / (options.steps - 1);
    const factor = options.minimumFactor + (options.maximumFactor - options.minimumFactor) * fraction;
    const variedQuantity = { ...baseline, value: baseline.value * factor };
    const variedInput = { ...input, [parameter]: variedQuantity };
    const result = calculateTransportTimes(variedInput);
    return {
      factor,
      inputValue: variedQuantity.value,
      variedInput,
      result,
      ...(result.complete && result.aggregates.calculatedTotal.value !== undefined
        ? { totalSeconds: result.aggregates.calculatedTotal.value }
        : {}),
    };
  });

  return {
    method: "deterministic-one-at-a-time",
    parameter,
    baseline,
    range: { ...options },
    points,
    interpretation: "No mechanism is inferred; each point changes only the selected input while all other inputs remain at baseline.",
  };
}

function definitionMetadata(
  definition: Readonly<TermDefinition>,
  type: RateModelParameterType,
  provenance: string,
): TransportTermBase {
  return {
    id: definition.id,
    equationTerm: definition.equationTerm,
    group: definition.group,
    equation: definition.equation,
    unit: "s",
    type,
    provenance,
    missingInputs: [],
  };
}

function aggregateTerms(
  id: TransportAggregate["id"],
  terms: ReadonlyArray<Readonly<TransportTerm>>,
  requiredIds: ReadonlyArray<TransportTermId>,
  provenance: string,
): TransportAggregate {
  const selected = requiredIds.map((termId) => terms.find(({ id: candidateId }) => candidateId === termId));
  const missingTermIds = selected.flatMap((term, index) => term?.status === "available" ? [] : [requiredIds[index]]);
  if (missingTermIds.length > 0) {
    return { id, status: "unavailable", unit: "s", type: "derived", provenance, missingTermIds };
  }
  const value = selected.reduce((sum, term) => sum + (term?.status === "available" ? term.value : 0), 0);
  if (!Number.isFinite(value) || value <= 0) {
    return { id, status: "unavailable", unit: "s", type: "derived", provenance, missingTermIds: [] };
  }
  return { id, status: "available", value, unit: "s", type: "derived", provenance, missingTermIds: [] };
}

function isUsableInput(
  key: TransportInputKey,
  quantity: Readonly<TaggedTransportQuantity> | undefined,
): quantity is Readonly<TaggedTransportQuantity> {
  if (!quantity || !isUsableQuantity(quantity)) return false;
  return (key === "electrodePorosity" || key === "separatorPorosity")
    ? quantity.value <= 1
    : true;
}

function isUsableQuantity(quantity: Readonly<TaggedTransportQuantity>): boolean {
  return Number.isFinite(quantity.value)
    && quantity.value > 0
    && typeof quantity.provenance === "string"
    && quantity.provenance.trim().length > 0;
}

function toSi(quantity: Readonly<TaggedTransportQuantity>): number {
  switch (quantity.unit) {
    case "m":
    case "S-m-1":
    case "m2-s-1":
    case "fraction":
    case "s": return quantity.value;
    case "um": return quantity.value * 1e-6;
    case "nm": return quantity.value * 1e-9;
    case "F-m-3": return quantity.value;
    case "F-cm-3": return quantity.value * 1e6;
    case "h": return quantity.value * 3600;
  }
}
