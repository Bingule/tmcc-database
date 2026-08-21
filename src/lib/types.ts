export type MaterialType = "pristine" | "tm_intercalated" | "m2xa";
export type MaterialSubclass = "TMCC" | "TMCDC";
export type StructureType = "M2XC" | "M2XN" | "M2X2C" | "M2X2N" | "M2X2A" | "M2XA";
export type CalculationStatus = "not_calculated" | "calculation_in_progress" | "calculated";
export type ExperimentalStatus = null | "unknown" | "experimental" | "not_reported" | "computational";
export type IntercalationMode = "self" | "hetero";
export type UnitValue = {
  value: number | null;
  unit: string;
};

export type StructureProperties = Record<string, unknown> & {
  cell_volume?: UnitValue;
  density?: UnitValue;
};

export type ThermodynamicsProperties = Record<string, unknown> & {
  formation_energy?: UnitValue;
  formation_energy_per_atom?: UnitValue;
};

export type MechanicalProperties = Record<string, unknown> & {
  mechanically_stable?: boolean | null;
  elastic_constants?: Record<string, unknown> | null;
};

export type HostDescriptor = {
  formula: string;
  metal: string;
  chalcogen: "S" | "Se" | "Te";
  anion: "C" | "N" | "P" | "As" | "Sb" | "Bi" | "Si" | "Ge" | "Sn" | "Pb" | "B" | "Al" | "Ga" | "In";
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
  experimental_xrd?: string | null;
  raman?: string | null;
  sem?: string | null;
  reference?: string | null;
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
  subclass: MaterialSubclass;
  structure_type: StructureType;
  formula: string;
  host: HostDescriptor;
  intercalation: IntercalationDescriptor | null;
  experimental_status: ExperimentalStatus;
  calculation_status: CalculationStatus;
  structure: StructureProperties;
  thermodynamics: ThermodynamicsProperties;
  phonons: Record<string, unknown>;
  mechanical: MechanicalProperties;
  electronic: Record<string, unknown>;
  energy_storage: Record<string, unknown>;
  files: MaterialFiles;
  provenance: Record<string, unknown>;
};

export type FormulaPart = {
  text: string;
  subscript: boolean;
};
