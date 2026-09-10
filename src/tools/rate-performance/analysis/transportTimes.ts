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
export type TransportQuantityKey = TransportInputKey | "fittedTau";

export type TransportInvalidReason =
  | "non-finite"
  | "non-positive"
  | "out-of-range"
  | "missing-provenance"
  | "numerical-overflow"
  | "numerical-underflow";

export interface TransportInvalidInput<Key extends TransportQuantityKey = TransportQuantityKey> {
  readonly key: Key;
  readonly reason: TransportInvalidReason;
}

export type TransportUnavailabilityReason =
  | "missing-inputs"
  | "invalid-inputs"
  | "missing-and-invalid-inputs"
  | "numerical-overflow"
  | "numerical-underflow"
  | "unavailable-terms"
  | "no-available-terms";

export interface TransportParameterBounds {
  readonly exclusiveMinimum: number;
  readonly inclusiveMaximum?: number;
}

export interface TransportInputDefinition {
  readonly key: TransportInputKey;
  readonly bounds: Readonly<TransportParameterBounds>;
}

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
  readonly invalidInputs: ReadonlyArray<Readonly<TransportInvalidInput<TransportInputKey>>>;
}

export interface AvailableTransportTerm extends TransportTermBase {
  readonly status: "available";
  readonly value: number;
  readonly missingInputs: readonly [];
  readonly invalidInputs: readonly [];
}

export interface UnavailableTransportTerm extends TransportTermBase {
  readonly status: "unavailable";
  readonly missingInputs: ReadonlyArray<TransportInputKey>;
  readonly invalidInputs: ReadonlyArray<Readonly<TransportInvalidInput<TransportInputKey>>>;
  readonly unavailabilityReason: TransportUnavailabilityReason;
}

export type TransportTerm = AvailableTransportTerm | UnavailableTransportTerm;

interface TransportAggregateBase {
  readonly id: "electrical" | "diffusive" | "calculated-total" | "available-partial-sum";
  readonly unit: "s";
  readonly type: "derived";
  readonly provenance: string;
  readonly missingTermIds: ReadonlyArray<TransportTermId>;
  readonly includedTermIds: ReadonlyArray<TransportTermId>;
}

export interface AvailableTransportAggregate extends TransportAggregateBase {
  readonly status: "available";
  readonly value: number;
}

export interface UnavailableTransportAggregate extends TransportAggregateBase {
  readonly status: "unavailable";
  readonly unavailabilityReason: TransportUnavailabilityReason;
}

export type TransportAggregate = AvailableTransportAggregate | UnavailableTransportAggregate;

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
    readonly availablePartialSum: Readonly<TransportAggregate>;
  };
  readonly availableSum?: number;
  readonly unit: "s";
  readonly complete: boolean;
  readonly invalidInputs: ReadonlyArray<Readonly<TransportInvalidInput<TransportInputKey>>>;
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

const INPUT_DEFINITIONS: Readonly<Record<TransportInputKey, Readonly<TransportInputDefinition>>> = Object.freeze(
  Object.fromEntries(INPUT_KEYS.map((key) => [key, Object.freeze({
    key,
    bounds: Object.freeze({
      exclusiveMinimum: 0,
      ...((key === "electrodePorosity" || key === "separatorPorosity")
        ? { inclusiveMaximum: 1 }
        : {}),
    }),
  })])) as Record<TransportInputKey, Readonly<TransportInputDefinition>>,
);

export function getTransportInputDefinition(key: TransportInputKey): Readonly<TransportInputDefinition> {
  return INPUT_DEFINITIONS[key];
}

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
  const invalidInputs: Array<Readonly<TransportInvalidInput<TransportInputKey>>> = [];
  const values = {} as Record<TransportInputKey, number>;
  for (const key of INPUT_KEYS) {
    const quantity = input[key];
    if (!quantity) continue;
    const validation = validateAndConvertQuantity(key, quantity);
    if (validation.status === "invalid") invalidInputs.push(validation.invalidInput);
    else values[key] = validation.siValue;
  }

  const terms = TERM_DEFINITIONS.map((definition): TransportTerm => {
    const missingInputs = definition.required.filter((key) => input[key] === undefined);
    const termInvalidInputs = invalidInputs.filter(({ key }) => definition.required.includes(key));
    const provenance = definition.id === "kinetic"
      ? `${input.kineticTime?.provenance ?? "User-supplied kinetic time"}; Tian et al. (2019), Eq. 6a term 7`
      : `Derived from Tian et al. (2019), Eq. 6a term ${definition.equationTerm} using SI-converted inputs.`;
    const type = definition.id === "kinetic" ? input.kineticTime?.type ?? "user-input" : "derived";

    if (missingInputs.length > 0 || termInvalidInputs.length > 0) {
      return {
        ...definitionMetadata(definition, type, provenance),
        status: "unavailable",
        missingInputs,
        invalidInputs: termInvalidInputs,
        unavailabilityReason: missingInputs.length > 0 && termInvalidInputs.length > 0
          ? "missing-and-invalid-inputs"
          : missingInputs.length > 0
            ? "missing-inputs"
            : "invalid-inputs",
      };
    }

    const value = definition.calculate(values);
    if (!Number.isFinite(value)) {
      return {
        ...definitionMetadata(definition, type, provenance),
        status: "unavailable",
        missingInputs: [],
        invalidInputs: [],
        unavailabilityReason: "numerical-overflow",
      };
    }
    if (value <= 0) {
      return {
        ...definitionMetadata(definition, type, provenance),
        status: "unavailable",
        missingInputs: [],
        invalidInputs: [],
        unavailabilityReason: "numerical-underflow",
      };
    }
    return {
      ...definitionMetadata(definition, type, provenance),
      status: "available",
      value,
      missingInputs: [],
      invalidInputs: [],
    };
  });

  const available = terms.filter((term): term is AvailableTransportTerm => term.status === "available");
  const availableSumResult = available.length > 0
    ? sumPositiveFinite(available.map(({ value }) => value))
    : undefined;
  const availableSum = availableSumResult?.status === "available" ? availableSumResult.value : undefined;
  const complete = available.length === TERM_DEFINITIONS.length
    && available.every(({ value }) => Number.isFinite(value) && value > 0)
    && availableSum !== undefined;
  const electrical = aggregateTerms("electrical", terms, ELECTRICAL_TERM_IDS, "Tian et al. (2019), Eqs. 5c and 6a electrical terms 1, 2, and 4.");
  const diffusive = aggregateTerms("diffusive", terms, DIFFUSIVE_TERM_IDS, "Tian et al. (2019), Eqs. 5b and 6a diffusive terms 3, 5, and 6.");
  const calculatedTotal = aggregateTerms(
    "calculated-total",
    terms,
    TERM_DEFINITIONS.map(({ id }) => id),
    "Sum of all seven Tian et al. (2019), Eq. 6a components.",
  );
  const availablePartialSum = aggregateAvailableTerms(terms);

  return {
    terms,
    aggregates: { electrical, diffusive, calculatedTotal, availablePartialSum },
    availableSum,
    unit: "s",
    complete,
    invalidInputs,
    relativeContributions: complete && availableSum !== undefined
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
    readonly missingInputs: ReadonlyArray<"fittedTau">;
    readonly invalidInputs: ReadonlyArray<Readonly<TransportInvalidInput<"fittedTau">>>;
    readonly unavailabilityReason: TransportUnavailabilityReason;
    readonly unit: "s";
    readonly type: "derived";
    readonly provenance: string;
    readonly fittedTotal?: number;
  }
  | {
    readonly status: "available";
    readonly missingInputs: readonly [];
    readonly invalidInputs: readonly [];
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
  if (!fittedTau) {
    return {
      status: "unavailable",
      missingInputs: ["fittedTau"],
      invalidInputs: [],
      unavailabilityReason: "missing-inputs",
      unit: "s",
      type: "derived",
      provenance,
    };
  }
  const fittedValidation = validateAndConvertQuantity("fittedTau", fittedTau);
  if (fittedValidation.status === "invalid") {
    return {
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [fittedValidation.invalidInput],
      unavailabilityReason: "invalid-inputs",
      unit: "s",
      type: "derived",
      provenance,
    };
  }
  const fittedTotal = fittedValidation.siValue;
  const available = components.filter((component): component is AvailableTransportTerm => component.status === "available");
  if (available.length === 0) {
    return {
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: "no-available-terms",
      unit: "s",
      type: "derived",
      provenance,
      fittedTotal,
    };
  }
  const componentSum = sumPositiveFinite(available.map(({ value }) => value));
  if (componentSum.status === "unavailable") {
    return {
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: componentSum.reason,
      unit: "s",
      type: "derived",
      provenance,
    };
  }
  const availableComponentSum = componentSum.value;
  const difference = fittedTotal - availableComponentSum;
  if (!Number.isFinite(difference)) {
    return {
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: "numerical-overflow",
      unit: "s",
      type: "derived",
      provenance,
    };
  }
  const consistencyWarning = difference < 0;
  return {
    status: "available",
    missingInputs: [],
    invalidInputs: [],
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
  readonly status: "available" | "unavailable";
  readonly termFailures: ReadonlyArray<Readonly<TransportSensitivityTermFailure>>;
  readonly unavailableReason?: TransportUnavailabilityReason;
  readonly totalSeconds?: number;
}

export interface TransportSensitivityTermFailure {
  readonly termId: TransportTermId;
  readonly reason: TransportUnavailabilityReason;
  readonly missingInputs: ReadonlyArray<TransportInputKey>;
  readonly invalidInputs: ReadonlyArray<Readonly<TransportInvalidInput<TransportInputKey>>>;
}

export interface TransportSensitivitySeries {
  readonly method: "deterministic-one-at-a-time";
  readonly parameter: TransportInputKey;
  readonly baseline: Readonly<TaggedTransportQuantity>;
  readonly requestedRange: Readonly<TransportSensitivityOptions>;
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
  const baselineValidation = baseline ? validateAndConvertQuantity(parameter, baseline) : undefined;
  if (!baseline || baselineValidation?.status !== "valid") {
    throw new RangeError(`${parameter} requires a positive finite baseline before sensitivity analysis.`);
  }
  if (!Number.isFinite(options.minimumFactor) || options.minimumFactor <= 0
    || !Number.isFinite(options.maximumFactor) || options.maximumFactor < options.minimumFactor
    || options.minimumFactor >= 1 || options.maximumFactor <= 1) {
    throw new RangeError("Sensitivity range must provide two valid points on each side of the 1x baseline.");
  }
  if (options.steps !== 5) {
    throw new RangeError("Sensitivity analysis requires exactly five points.");
  }

  const definition = getTransportInputDefinition(parameter);
  const maximumFactor = definition.bounds.inclusiveMaximum === undefined
    ? options.maximumFactor
    : Math.min(options.maximumFactor, definition.bounds.inclusiveMaximum / baseline.value);
  if (!Number.isFinite(maximumFactor) || maximumFactor <= 1) {
    throw new RangeError(`${parameter} sensitivity range cannot provide two valid points on each side of the 1x baseline.`);
  }
  const range = { ...options, maximumFactor };
  const factors = [
    range.minimumFactor,
    (range.minimumFactor + 1) / 2,
    1,
    (1 + range.maximumFactor) / 2,
    range.maximumFactor,
  ];

  const points = factors.map((factor): TransportSensitivityPoint => {
    const variedQuantity = {
      ...baseline,
      value: definition.bounds.inclusiveMaximum === undefined
        ? baseline.value * factor
        : Math.min(baseline.value * factor, definition.bounds.inclusiveMaximum),
    };
    const variedInput = { ...input, [parameter]: variedQuantity };
    const result = calculateTransportTimes(variedInput);
    const total = result.aggregates.calculatedTotal;
    const termFailures = result.terms.flatMap((term): ReadonlyArray<TransportSensitivityTermFailure> =>
      term.status === "unavailable" ? [{
        termId: term.id,
        reason: term.unavailabilityReason,
        missingInputs: term.missingInputs,
        invalidInputs: term.invalidInputs,
      }] : []);
    const numericalTermFailure = termFailures.find(({ reason }) =>
      reason === "numerical-overflow" || reason === "numerical-underflow");
    return {
      factor,
      inputValue: variedQuantity.value,
      variedInput,
      result,
      termFailures,
      ...(result.complete && total.status === "available" && total.value !== undefined
        ? { status: "available" as const, totalSeconds: total.value }
        : {
          status: "unavailable" as const,
          unavailableReason: total.status === "unavailable" && total.unavailabilityReason === "unavailable-terms"
            ? numericalTermFailure?.reason ?? "unavailable-terms"
            : total.status === "unavailable" ? total.unavailabilityReason : "unavailable-terms",
        }),
    };
  });

  return {
    method: "deterministic-one-at-a-time",
    parameter,
    baseline,
    requestedRange: { ...options },
    range,
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
    invalidInputs: [],
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
  const includedTermIds = selected.flatMap((term, index) => term?.status === "available" ? [requiredIds[index]] : []);
  if (missingTermIds.length > 0) {
    return {
      id,
      status: "unavailable",
      unit: "s",
      type: "derived",
      provenance,
      missingTermIds,
      includedTermIds,
      unavailabilityReason: "unavailable-terms",
    };
  }
  const sum = sumPositiveFinite(selected.flatMap((term) => term?.status === "available" ? [term.value] : []));
  if (sum.status === "unavailable") {
    return {
      id,
      status: "unavailable",
      unit: "s",
      type: "derived",
      provenance,
      missingTermIds: [],
      includedTermIds,
      unavailabilityReason: sum.reason,
    };
  }
  return {
    id,
    status: "available",
    value: sum.value,
    unit: "s",
    type: "derived",
    provenance,
    missingTermIds: [],
    includedTermIds,
  };
}

function aggregateAvailableTerms(terms: ReadonlyArray<Readonly<TransportTerm>>): TransportAggregate {
  const included = terms.filter((term): term is AvailableTransportTerm => term.status === "available");
  const includedTermIds = included.map(({ id }) => id);
  const missingTermIds = terms.flatMap((term) => term.status === "available" ? [] : [term.id]);
  const termNumbers = included.map(({ equationTerm }) => equationTerm).join(", ");
  const provenance = included.length > 0
    ? `Sum of available Tian et al. (2019), Eq. 6a term${included.length === 1 ? "" : "s"} ${termNumbers}.`
    : "No Tian et al. (2019), Eq. 6a term is available to sum.";
  if (included.length === 0) {
    return {
      id: "available-partial-sum",
      status: "unavailable",
      unit: "s",
      type: "derived",
      provenance,
      missingTermIds,
      includedTermIds,
      unavailabilityReason: "no-available-terms",
    };
  }
  const sum = sumPositiveFinite(included.map(({ value }) => value));
  if (sum.status === "unavailable") {
    return {
      id: "available-partial-sum",
      status: "unavailable",
      unit: "s",
      type: "derived",
      provenance,
      missingTermIds,
      includedTermIds,
      unavailabilityReason: sum.reason,
    };
  }
  return {
    id: "available-partial-sum",
    status: "available",
    value: sum.value,
    unit: "s",
    type: "derived",
    provenance,
    missingTermIds,
    includedTermIds,
  };
}

function sumPositiveFinite(values: ReadonlyArray<number>):
  | { readonly status: "available"; readonly value: number }
  | { readonly status: "unavailable"; readonly reason: "numerical-overflow" | "numerical-underflow" } {
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return { status: "unavailable", reason: "numerical-overflow" };
    if (value <= 0) return { status: "unavailable", reason: "numerical-underflow" };
    sum += value;
    if (!Number.isFinite(sum)) return { status: "unavailable", reason: "numerical-overflow" };
  }
  return { status: "available", value: sum };
}

function validateAndConvertQuantity<Key extends TransportQuantityKey>(
  key: Key,
  quantity: Readonly<TaggedTransportQuantity>,
):
  | { readonly status: "valid"; readonly siValue: number }
  | { readonly status: "invalid"; readonly invalidInput: Readonly<TransportInvalidInput<Key>> } {
  if (!Number.isFinite(quantity.value)) {
    return { status: "invalid", invalidInput: { key, reason: "non-finite" } };
  }
  if (quantity.value <= 0) {
    return { status: "invalid", invalidInput: { key, reason: "non-positive" } };
  }
  if (typeof quantity.provenance !== "string" || quantity.provenance.trim().length === 0) {
    return { status: "invalid", invalidInput: { key, reason: "missing-provenance" } };
  }
  if (key !== "fittedTau") {
    const maximum = getTransportInputDefinition(key).bounds.inclusiveMaximum;
    if (maximum !== undefined && quantity.value > maximum) {
      return { status: "invalid", invalidInput: { key, reason: "out-of-range" } };
    }
  }
  const siValue = toSi(quantity);
  if (!Number.isFinite(siValue)) {
    return { status: "invalid", invalidInput: { key, reason: "numerical-overflow" } };
  }
  if (siValue <= 0) {
    return { status: "invalid", invalidInput: { key, reason: "numerical-underflow" } };
  }
  return { status: "valid", siValue };
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
