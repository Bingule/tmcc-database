import type { TranslationKey } from "../locales/en";

const crystalSystemTranslationKeys = {
  triclinic: "crystalSystem.triclinic",
  monoclinic: "crystalSystem.monoclinic",
  orthorhombic: "crystalSystem.orthorhombic",
  tetragonal: "crystalSystem.tetragonal",
  trigonal: "crystalSystem.trigonal",
  hexagonal: "crystalSystem.hexagonal",
  rhombohedral: "crystalSystem.rhombohedral",
  cubic: "crystalSystem.cubic"
} as const satisfies Record<string, TranslationKey>;

const configurationTranslationKeys = {
  "generated R-3m baseline": "selector.generatedR3mBaseline",
  "generated P-3m1 baseline": "selector.generatedP3m1Baseline",
  "generated N-intercalated R-3m baseline": "selector.generatedNIntercalatedR3mBaseline",
  "generated N-intercalated P-3m1 baseline": "selector.generatedNIntercalatedP3m1Baseline"
} as const satisfies Record<string, TranslationKey>;

export function getCrystalSystemTranslationKey(value: unknown): TranslationKey | null {
  if (typeof value !== "string") return null;
  return crystalSystemTranslationKeys[value.trim().toLowerCase() as keyof typeof crystalSystemTranslationKeys] ?? null;
}

export function getConfigurationTranslationKey(value: unknown): TranslationKey | null {
  if (typeof value !== "string") return null;
  return configurationTranslationKeys[value as keyof typeof configurationTranslationKeys] ?? null;
}
