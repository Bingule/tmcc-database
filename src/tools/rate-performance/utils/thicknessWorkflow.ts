import type { TranslationKey } from "../../../locales/en";
import type { ThicknessSeriesConverged } from "../analysis/fitThicknessSeries";
import type { ThicknessScalingFailureCode, ThicknessScalingSample } from "../analysis/thicknessScaling";
import { createInitialRateDataInputValue, type RateDataInputValue } from "../components/RateDataInput";
import type { ThicknessElectrodeDraft } from "../components/ThicknessSampleInput";
import type { ThicknessSampleFailure } from "../components/ThicknessScalingResults";
import type { ThicknessKineticsExample } from "../data/thicknessExamples";

export type ThicknessMessageKey = Extract<TranslationKey, `rate.thickness.${string}`>;

export function createBlankThicknessDraft(id: string, sampleName: string): ThicknessElectrodeDraft {
  return { id, sampleName, thickness: null, thicknessUnit: "um", massLoading: null, modelId: "tian-characteristic-time", rateInput: createInitialRateDataInputValue() };
}

export function cloneThicknessRateInput(input: Readonly<RateDataInputValue>, id: string): RateDataInputValue {
  return {
    mode: input.mode,
    points: input.points.map((point, index) => ({ ...point, id: `${id}-point-${index + 1}` })),
    normalizationContext: {
      ...input.normalizationContext,
      theoreticalCapacity: input.normalizationContext.theoreticalCapacity ? { ...input.normalizationContext.theoreticalCapacity } : undefined,
    },
  };
}

export function cloneThicknessDraft(sample: Readonly<ThicknessElectrodeDraft>): ThicknessElectrodeDraft {
  return { ...sample, rateInput: cloneThicknessRateInput(sample.rateInput, sample.id) };
}

export function createExampleThicknessDrafts(
  example: Readonly<ThicknessKineticsExample>,
  createId: () => string,
): ThicknessElectrodeDraft[] {
  return example.samples.map((sample) => {
    const id = createId();
    return {
      id,
      sampleName: sample.sampleName,
      thickness: sample.thickness,
      thicknessUnit: sample.thicknessUnit,
      massLoading: sample.massLoading ?? null,
      modelId: "tian-characteristic-time",
      rateInput: {
        mode: "manual",
        points: sample.dataset.points.map((point, index) => ({ ...point, id: `${id}-point-${index + 1}` })),
        normalizationContext: { confirmHInverseMeasuredRate: true },
      },
    };
  });
}

export function thicknessDisplayName(sample: Readonly<ThicknessElectrodeDraft>, index: number) {
  return sample.sampleName.trim() || `Electrode ${index + 1}`;
}

export function thicknessSampleFailure(sample: Readonly<ThicknessElectrodeDraft>, index: number, reason: string): ThicknessSampleFailure {
  return { id: sample.id, sampleName: thicknessDisplayName(sample, index), reason };
}

export function mapSuccessfulThicknessFit(
  sample: Readonly<ThicknessElectrodeDraft>,
  index: number,
  outcome: Readonly<ThicknessSeriesConverged>,
): ThicknessScalingSample {
  const sampleName = thicknessDisplayName(sample, index);
  return {
    id: sample.id,
    sampleName,
    thickness: sample.thickness as number,
    thicknessUnit: sample.thicknessUnit,
    massLoading: sample.massLoading,
    modelId: sample.modelId,
    tau: outcome.fit.parameters.tau,
    tauStandardError: outcome.fit.uncertainty.parameters.tau.standardError,
  };
}

export function thicknessScalingFailureKey(code: ThicknessScalingFailureCode): ThicknessMessageKey {
  switch (code) {
    case "insufficient-distinct-thicknesses": return "rate.thickness.failure.insufficient";
    case "duplicate-thickness": return "rate.thickness.failure.duplicate";
    case "invalid-thickness": return "rate.thickness.failure.invalidThickness";
    case "mixed-models": return "rate.thickness.failure.mixedModels";
    case "invalid-tau":
    case "invalid-tau-uncertainty":
    case "regression-failed": return "rate.thickness.failure.scaling";
  }
}
