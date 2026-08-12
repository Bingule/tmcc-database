export type MaterialType = "pristine" | "tm_intercalated" | "m2xa";
export type CalculationStatus = "not_calculated" | "calculation_in_progress" | "calculated";
export type ExperimentalStatus = null | "unknown" | "experimental" | "not_reported";
export type IntercalationMode = "self" | "hetero";
export type UnitValue = {
  value: number | null;
  unit: string;
};

export type HostDescriptor = {
  formula: string;
  metal: string;
  chalcogen: "S" | "Se" | "Te";
  anion: "C" | "N";
};

export type IntercalationDescriptor = {
  intercalant: string;
  x: number;
  mode: IntercalationMode;
  site: string | null;
  ordering: string | null;
  configuration: string;
};

export type MaterialFiles = {
  cif?: string | null;
  poscar?: string | null;
  band_structure?: string | null;
  dos?: string | null;
  pdos?: string | null;
  phonon?: string | null;
  elf?: string | null;
  charge_density?: string | null;
  aimd?: string | null;
};

export type MaterialRecord = {
  material_id: string;
  slug: string;
  family: "TMCC";
  material_type: MaterialType;
  formula: string;
  host: HostDescriptor;
  intercalation: IntercalationDescriptor | null;
  experimental_status: ExperimentalStatus;
  calculation_status: CalculationStatus;
  structure: Record<string, unknown>;
  thermodynamics: Record<string, unknown>;
  phonons: Record<string, unknown>;
  mechanical: Record<string, unknown>;
  electronic: Record<string, unknown>;
  energy_storage: Record<string, unknown>;
  files: MaterialFiles;
  provenance: Record<string, unknown>;
};

export type FormulaPart = {
  text: string;
  subscript: boolean;
};
