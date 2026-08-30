import { evaluateRationalRate } from "./rationalCharacteristicTime";
import { evaluateTianRate } from "./tianCharacteristicTime";
import type {
  RateModelDefinition,
  RateModelIndependentVariableDefinition,
  RateModelParameterDefinition,
} from "./types";

const measuredRate: Readonly<RateModelIndependentVariableDefinition> = Object.freeze({
  symbol: "R",
  name: "measured rate",
  unit: "h^-1",
  definition: "Applied specific current divided by the measured capacity at that rate; equivalently inverse measured discharge time.",
});

const unconfirmedRate: Readonly<RateModelIndependentVariableDefinition> = Object.freeze({
  symbol: "unconfirmed",
  name: "independent variable pending validation",
  unit: "unconfirmed",
  definition: "The exact independent-variable definition and units must be verified against the primary publication before use.",
});

const characteristicTimeParameters: ReadonlyArray<Readonly<RateModelParameterDefinition>> = Object.freeze([
  Object.freeze({
    id: "qM",
    symbol: "Q_M",
    name: "low-rate maximum capacity",
    description: "Capacity approached in the low-rate limit.",
    unit: "same capacity unit as Q",
    type: "fitted",
    bounds: Object.freeze({ minimum: 0, minimumExclusive: true }),
    initialization: "Initialize from the largest valid measured capacity.",
  }),
  Object.freeze({
    id: "tau",
    symbol: "tau",
    name: "characteristic time",
    description: "Effective model-dependent charge/discharge timescale.",
    unit: "h",
    type: "fitted",
    bounds: Object.freeze({ minimum: 0, minimumExclusive: true }),
    initialization: "Initialize from the inverse rate near the observed capacity transition.",
  }),
  Object.freeze({
    id: "n",
    symbol: "n",
    name: "rate exponent",
    description: "Dimensionless exponent controlling the high-rate capacity falloff.",
    unit: "dimensionless",
    type: "fitted",
    bounds: Object.freeze({ minimum: 0, minimumExclusive: true }),
    initialization: "Initialize within a positive, literature-consistent bounded range.",
  }),
]);

function pendingModel(
  id: string,
  name: string,
  referenceIds: ReadonlyArray<string> = [],
): Readonly<RateModelDefinition> {
  return Object.freeze({
    id,
    name,
    family: "empirical candidate",
    status: "pending-validation",
    equation: "Pending validation; no executable equation is registered.",
    independentVariable: unconfirmedRate,
    parameters: Object.freeze([]),
    applicability: Object.freeze([
      "Applicability range remains unverified until the primary-source model is validated.",
    ]),
    assumptions: Object.freeze([
      "No scientific assumptions are accepted until the exact primary-source equation is verified.",
    ]),
    limitations: Object.freeze([
      "Fitting and numerical output are disabled while the equation, units, limits, and applicability remain unverified.",
    ]),
    referenceIds: Object.freeze([...referenceIds]),
    validationNote: "Primary-source equation, independent variable, parameter interpretation, limiting behavior, and applicability require validation.",
  });
}

const rateModels: ReadonlyArray<Readonly<RateModelDefinition>> = Object.freeze([
  Object.freeze({
    id: "tian-characteristic-time",
    name: "Characteristic-time rate model",
    family: "characteristic time",
    status: "validated",
    equation: "Q(R) = Q_M [1 - (R tau)^n (1 - exp(-(R tau)^(-n)))]",
    independentVariable: measuredRate,
    parameters: characteristicTimeParameters,
    applicability: Object.freeze([
      "Positive measured-rate capacity data spanning the low-rate plateau and rate-dependent capacity decline.",
    ]),
    assumptions: Object.freeze([
      "R is the positive finite measured rate defined from measured discharge time, not an unconverted nominal C-rate.",
      "Q_M, tau, and n are positive finite effective model parameters.",
    ]),
    limitations: Object.freeze([
      "The fitted characteristic time is model-dependent and is not by itself a direct microscopic measurement.",
      "Use outside the rate definition and applicability established by the cited publication is unsupported.",
    ]),
    referenceIds: Object.freeze([
      "tian-2019-rate-performance",
      "coleman-tian-2020-model-review",
    ]),
    validationNote: "Equation and measured-rate definition verified against Tian et al. (2019).",
    fit: evaluateTianRate,
  }),
  Object.freeze({
    id: "rational-characteristic-time",
    name: "Rational characteristic-time rate model",
    family: "characteristic time",
    status: "validated",
    equation: "Q(R) = Q_M / [1 + 2 (R tau)^n]",
    independentVariable: measuredRate,
    parameters: characteristicTimeParameters,
    applicability: Object.freeze([
      "The conventional capacity plateau and first capacity-decay regime of positive measured-rate data.",
    ]),
    assumptions: Object.freeze([
      "R is the positive finite measured rate defined from measured discharge time, not an unconverted nominal C-rate.",
      "Q_M, tau, and n are positive finite effective model parameters.",
    ]),
    limitations: Object.freeze([
      "The single rational term applies to the conventional capacity plateau and the first capacity-decay regime established by the cited chronoamperometry work.",
      "If a second high-rate decay is present, restrict the fitting range to the first decay or use the original publication's two-term model.",
      "The fitted characteristic time is model-dependent and is not by itself a direct microscopic measurement.",
    ]),
    referenceIds: Object.freeze([
      "tian-2020-chronoamperometry",
      "coleman-tian-2020-model-review",
    ]),
    validationNote: "Equation and measured-rate definition verified against Tian et al. (2020).",
    fit: evaluateRationalRate,
  }),
  pendingModel("peukert-type", "Peukert-type model"),
  pendingModel("exponential", "Exponential model"),
  pendingModel("power-law", "Power-law model"),
  pendingModel("wong-type", "Wong-type model"),
  pendingModel("heubner-type", "Heubner-type model", ["heubner-2018-master-curve"]),
]);

const modelById = new Map(rateModels.map((model) => [model.id, model]));

export function getRateModel(id: string): Readonly<RateModelDefinition> | undefined {
  return modelById.get(id);
}

export function listRateModels(): ReadonlyArray<Readonly<RateModelDefinition>> {
  return rateModels;
}

export type {
  RateModelDefinition,
  RateModelParameterDefinition,
  RateModelStatus,
} from "./types";
