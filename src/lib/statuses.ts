export const transitionMetals = [
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg"
];

export type PeriodicElement = {
  atomicNumber: number;
  symbol: string;
  name: string;
  group: number;
  period: number;
  category: "nonmetal" | "noble_gas" | "alkali_metal" | "alkaline_earth" | "metalloid" | "post_transition" | "transition_metal" | "lanthanide" | "actinide" | "halogen";
};

export const periodicTableElements: PeriodicElement[] = [
  { atomicNumber: 1, symbol: "H", name: "Hydrogen", group: 1, period: 1, category: "nonmetal" },
  { atomicNumber: 2, symbol: "He", name: "Helium", group: 18, period: 1, category: "noble_gas" },
  { atomicNumber: 3, symbol: "Li", name: "Lithium", group: 1, period: 2, category: "alkali_metal" },
  { atomicNumber: 4, symbol: "Be", name: "Beryllium", group: 2, period: 2, category: "alkaline_earth" },
  { atomicNumber: 5, symbol: "B", name: "Boron", group: 13, period: 2, category: "metalloid" },
  { atomicNumber: 6, symbol: "C", name: "Carbon", group: 14, period: 2, category: "nonmetal" },
  { atomicNumber: 7, symbol: "N", name: "Nitrogen", group: 15, period: 2, category: "nonmetal" },
  { atomicNumber: 8, symbol: "O", name: "Oxygen", group: 16, period: 2, category: "nonmetal" },
  { atomicNumber: 9, symbol: "F", name: "Fluorine", group: 17, period: 2, category: "halogen" },
  { atomicNumber: 10, symbol: "Ne", name: "Neon", group: 18, period: 2, category: "noble_gas" },
  { atomicNumber: 11, symbol: "Na", name: "Sodium", group: 1, period: 3, category: "alkali_metal" },
  { atomicNumber: 12, symbol: "Mg", name: "Magnesium", group: 2, period: 3, category: "alkaline_earth" },
  { atomicNumber: 13, symbol: "Al", name: "Aluminium", group: 13, period: 3, category: "post_transition" },
  { atomicNumber: 14, symbol: "Si", name: "Silicon", group: 14, period: 3, category: "metalloid" },
  { atomicNumber: 15, symbol: "P", name: "Phosphorus", group: 15, period: 3, category: "nonmetal" },
  { atomicNumber: 16, symbol: "S", name: "Sulfur", group: 16, period: 3, category: "nonmetal" },
  { atomicNumber: 17, symbol: "Cl", name: "Chlorine", group: 17, period: 3, category: "halogen" },
  { atomicNumber: 18, symbol: "Ar", name: "Argon", group: 18, period: 3, category: "noble_gas" },
  { atomicNumber: 19, symbol: "K", name: "Potassium", group: 1, period: 4, category: "alkali_metal" },
  { atomicNumber: 20, symbol: "Ca", name: "Calcium", group: 2, period: 4, category: "alkaline_earth" },
  { atomicNumber: 21, symbol: "Sc", name: "Scandium", group: 3, period: 4, category: "transition_metal" },
  { atomicNumber: 22, symbol: "Ti", name: "Titanium", group: 4, period: 4, category: "transition_metal" },
  { atomicNumber: 23, symbol: "V", name: "Vanadium", group: 5, period: 4, category: "transition_metal" },
  { atomicNumber: 24, symbol: "Cr", name: "Chromium", group: 6, period: 4, category: "transition_metal" },
  { atomicNumber: 25, symbol: "Mn", name: "Manganese", group: 7, period: 4, category: "transition_metal" },
  { atomicNumber: 26, symbol: "Fe", name: "Iron", group: 8, period: 4, category: "transition_metal" },
  { atomicNumber: 27, symbol: "Co", name: "Cobalt", group: 9, period: 4, category: "transition_metal" },
  { atomicNumber: 28, symbol: "Ni", name: "Nickel", group: 10, period: 4, category: "transition_metal" },
  { atomicNumber: 29, symbol: "Cu", name: "Copper", group: 11, period: 4, category: "transition_metal" },
  { atomicNumber: 30, symbol: "Zn", name: "Zinc", group: 12, period: 4, category: "transition_metal" },
  { atomicNumber: 31, symbol: "Ga", name: "Gallium", group: 13, period: 4, category: "post_transition" },
  { atomicNumber: 32, symbol: "Ge", name: "Germanium", group: 14, period: 4, category: "metalloid" },
  { atomicNumber: 33, symbol: "As", name: "Arsenic", group: 15, period: 4, category: "metalloid" },
  { atomicNumber: 34, symbol: "Se", name: "Selenium", group: 16, period: 4, category: "nonmetal" },
  { atomicNumber: 35, symbol: "Br", name: "Bromine", group: 17, period: 4, category: "halogen" },
  { atomicNumber: 36, symbol: "Kr", name: "Krypton", group: 18, period: 4, category: "noble_gas" },
  { atomicNumber: 37, symbol: "Rb", name: "Rubidium", group: 1, period: 5, category: "alkali_metal" },
  { atomicNumber: 38, symbol: "Sr", name: "Strontium", group: 2, period: 5, category: "alkaline_earth" },
  { atomicNumber: 39, symbol: "Y", name: "Yttrium", group: 3, period: 5, category: "transition_metal" },
  { atomicNumber: 40, symbol: "Zr", name: "Zirconium", group: 4, period: 5, category: "transition_metal" },
  { atomicNumber: 41, symbol: "Nb", name: "Niobium", group: 5, period: 5, category: "transition_metal" },
  { atomicNumber: 42, symbol: "Mo", name: "Molybdenum", group: 6, period: 5, category: "transition_metal" },
  { atomicNumber: 43, symbol: "Tc", name: "Technetium", group: 7, period: 5, category: "transition_metal" },
  { atomicNumber: 44, symbol: "Ru", name: "Ruthenium", group: 8, period: 5, category: "transition_metal" },
  { atomicNumber: 45, symbol: "Rh", name: "Rhodium", group: 9, period: 5, category: "transition_metal" },
  { atomicNumber: 46, symbol: "Pd", name: "Palladium", group: 10, period: 5, category: "transition_metal" },
  { atomicNumber: 47, symbol: "Ag", name: "Silver", group: 11, period: 5, category: "transition_metal" },
  { atomicNumber: 48, symbol: "Cd", name: "Cadmium", group: 12, period: 5, category: "transition_metal" },
  { atomicNumber: 49, symbol: "In", name: "Indium", group: 13, period: 5, category: "post_transition" },
  { atomicNumber: 50, symbol: "Sn", name: "Tin", group: 14, period: 5, category: "post_transition" },
  { atomicNumber: 51, symbol: "Sb", name: "Antimony", group: 15, period: 5, category: "metalloid" },
  { atomicNumber: 52, symbol: "Te", name: "Tellurium", group: 16, period: 5, category: "metalloid" },
  { atomicNumber: 53, symbol: "I", name: "Iodine", group: 17, period: 5, category: "halogen" },
  { atomicNumber: 54, symbol: "Xe", name: "Xenon", group: 18, period: 5, category: "noble_gas" },
  { atomicNumber: 55, symbol: "Cs", name: "Caesium", group: 1, period: 6, category: "alkali_metal" },
  { atomicNumber: 56, symbol: "Ba", name: "Barium", group: 2, period: 6, category: "alkaline_earth" },
  { atomicNumber: 57, symbol: "La", name: "Lanthanum", group: 3, period: 8, category: "lanthanide" },
  { atomicNumber: 58, symbol: "Ce", name: "Cerium", group: 4, period: 8, category: "lanthanide" },
  { atomicNumber: 59, symbol: "Pr", name: "Praseodymium", group: 5, period: 8, category: "lanthanide" },
  { atomicNumber: 60, symbol: "Nd", name: "Neodymium", group: 6, period: 8, category: "lanthanide" },
  { atomicNumber: 61, symbol: "Pm", name: "Promethium", group: 7, period: 8, category: "lanthanide" },
  { atomicNumber: 62, symbol: "Sm", name: "Samarium", group: 8, period: 8, category: "lanthanide" },
  { atomicNumber: 63, symbol: "Eu", name: "Europium", group: 9, period: 8, category: "lanthanide" },
  { atomicNumber: 64, symbol: "Gd", name: "Gadolinium", group: 10, period: 8, category: "lanthanide" },
  { atomicNumber: 65, symbol: "Tb", name: "Terbium", group: 11, period: 8, category: "lanthanide" },
  { atomicNumber: 66, symbol: "Dy", name: "Dysprosium", group: 12, period: 8, category: "lanthanide" },
  { atomicNumber: 67, symbol: "Ho", name: "Holmium", group: 13, period: 8, category: "lanthanide" },
  { atomicNumber: 68, symbol: "Er", name: "Erbium", group: 14, period: 8, category: "lanthanide" },
  { atomicNumber: 69, symbol: "Tm", name: "Thulium", group: 15, period: 8, category: "lanthanide" },
  { atomicNumber: 70, symbol: "Yb", name: "Ytterbium", group: 16, period: 8, category: "lanthanide" },
  { atomicNumber: 71, symbol: "Lu", name: "Lutetium", group: 17, period: 8, category: "lanthanide" },
  { atomicNumber: 72, symbol: "Hf", name: "Hafnium", group: 4, period: 6, category: "transition_metal" },
  { atomicNumber: 73, symbol: "Ta", name: "Tantalum", group: 5, period: 6, category: "transition_metal" },
  { atomicNumber: 74, symbol: "W", name: "Tungsten", group: 6, period: 6, category: "transition_metal" },
  { atomicNumber: 75, symbol: "Re", name: "Rhenium", group: 7, period: 6, category: "transition_metal" },
  { atomicNumber: 76, symbol: "Os", name: "Osmium", group: 8, period: 6, category: "transition_metal" },
  { atomicNumber: 77, symbol: "Ir", name: "Iridium", group: 9, period: 6, category: "transition_metal" },
  { atomicNumber: 78, symbol: "Pt", name: "Platinum", group: 10, period: 6, category: "transition_metal" },
  { atomicNumber: 79, symbol: "Au", name: "Gold", group: 11, period: 6, category: "transition_metal" },
  { atomicNumber: 80, symbol: "Hg", name: "Mercury", group: 12, period: 6, category: "transition_metal" },
  { atomicNumber: 81, symbol: "Tl", name: "Thallium", group: 13, period: 6, category: "post_transition" },
  { atomicNumber: 82, symbol: "Pb", name: "Lead", group: 14, period: 6, category: "post_transition" },
  { atomicNumber: 83, symbol: "Bi", name: "Bismuth", group: 15, period: 6, category: "post_transition" },
  { atomicNumber: 84, symbol: "Po", name: "Polonium", group: 16, period: 6, category: "post_transition" },
  { atomicNumber: 85, symbol: "At", name: "Astatine", group: 17, period: 6, category: "halogen" },
  { atomicNumber: 86, symbol: "Rn", name: "Radon", group: 18, period: 6, category: "noble_gas" },
  { atomicNumber: 87, symbol: "Fr", name: "Francium", group: 1, period: 7, category: "alkali_metal" },
  { atomicNumber: 88, symbol: "Ra", name: "Radium", group: 2, period: 7, category: "alkaline_earth" },
  { atomicNumber: 89, symbol: "Ac", name: "Actinium", group: 3, period: 9, category: "actinide" },
  { atomicNumber: 90, symbol: "Th", name: "Thorium", group: 4, period: 9, category: "actinide" },
  { atomicNumber: 91, symbol: "Pa", name: "Protactinium", group: 5, period: 9, category: "actinide" },
  { atomicNumber: 92, symbol: "U", name: "Uranium", group: 6, period: 9, category: "actinide" },
  { atomicNumber: 93, symbol: "Np", name: "Neptunium", group: 7, period: 9, category: "actinide" },
  { atomicNumber: 94, symbol: "Pu", name: "Plutonium", group: 8, period: 9, category: "actinide" },
  { atomicNumber: 95, symbol: "Am", name: "Americium", group: 9, period: 9, category: "actinide" },
  { atomicNumber: 96, symbol: "Cm", name: "Curium", group: 10, period: 9, category: "actinide" },
  { atomicNumber: 97, symbol: "Bk", name: "Berkelium", group: 11, period: 9, category: "actinide" },
  { atomicNumber: 98, symbol: "Cf", name: "Californium", group: 12, period: 9, category: "actinide" },
  { atomicNumber: 99, symbol: "Es", name: "Einsteinium", group: 13, period: 9, category: "actinide" },
  { atomicNumber: 100, symbol: "Fm", name: "Fermium", group: 14, period: 9, category: "actinide" },
  { atomicNumber: 101, symbol: "Md", name: "Mendelevium", group: 15, period: 9, category: "actinide" },
  { atomicNumber: 102, symbol: "No", name: "Nobelium", group: 16, period: 9, category: "actinide" },
  { atomicNumber: 103, symbol: "Lr", name: "Lawrencium", group: 17, period: 9, category: "actinide" },
  { atomicNumber: 104, symbol: "Rf", name: "Rutherfordium", group: 4, period: 7, category: "transition_metal" },
  { atomicNumber: 105, symbol: "Db", name: "Dubnium", group: 5, period: 7, category: "transition_metal" },
  { atomicNumber: 106, symbol: "Sg", name: "Seaborgium", group: 6, period: 7, category: "transition_metal" },
  { atomicNumber: 107, symbol: "Bh", name: "Bohrium", group: 7, period: 7, category: "transition_metal" },
  { atomicNumber: 108, symbol: "Hs", name: "Hassium", group: 8, period: 7, category: "transition_metal" },
  { atomicNumber: 109, symbol: "Mt", name: "Meitnerium", group: 9, period: 7, category: "transition_metal" },
  { atomicNumber: 110, symbol: "Ds", name: "Darmstadtium", group: 10, period: 7, category: "transition_metal" },
  { atomicNumber: 111, symbol: "Rg", name: "Roentgenium", group: 11, period: 7, category: "transition_metal" },
  { atomicNumber: 112, symbol: "Cn", name: "Copernicium", group: 12, period: 7, category: "transition_metal" },
  { atomicNumber: 113, symbol: "Nh", name: "Nihonium", group: 13, period: 7, category: "post_transition" },
  { atomicNumber: 114, symbol: "Fl", name: "Flerovium", group: 14, period: 7, category: "post_transition" },
  { atomicNumber: 115, symbol: "Mc", name: "Moscovium", group: 15, period: 7, category: "post_transition" },
  { atomicNumber: 116, symbol: "Lv", name: "Livermorium", group: 16, period: 7, category: "post_transition" },
  { atomicNumber: 117, symbol: "Ts", name: "Tennessine", group: 17, period: 7, category: "halogen" },
  { atomicNumber: 118, symbol: "Og", name: "Oganesson", group: 18, period: 7, category: "noble_gas" }
];

export const chalcogens = ["S", "Se", "Te"] as const;
export const anions = ["C", "N"] as const;

export const calculationStatuses = [
  "not_calculated",
  "calculation_in_progress",
  "calculated"
] as const;

export const experimentalStatuses = ["unknown", "experimental", "not_reported", "computational"] as const;

export const materialStatuses = {
  experimental: {
    label: "Experimentally synthesized",
    color: "#2f7d5c",
    background: "#e4f4ec"
  },
  predicted_stable: {
    label: "Computationally predicted stable",
    color: "#256f9c",
    background: "#e1f0f8"
  },
  metastable: {
    label: "Metastable",
    color: "#8a6a15",
    background: "#f8efcf"
  },
  unstable: {
    label: "Unstable",
    color: "#a6423f",
    background: "#f7e4e2"
  },
  calculation_in_progress: {
    label: "Calculation in progress",
    color: "#6d5d87",
    background: "#eee9f6"
  },
  not_calculated: {
    label: "Not calculated",
    color: "#68707a",
    background: "#edf0f2"
  }
} as const;
