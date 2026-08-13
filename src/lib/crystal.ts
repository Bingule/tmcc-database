export type CrystalCell = {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
};

export type CrystalAtom = {
  element: string;
  label: string;
  fract: [number, number, number];
};

export type ParsedCrystalStructure = {
  cell: CrystalCell;
  atoms: CrystalAtom[];
};

type UnitLike = {
  value?: unknown;
  unit?: unknown;
};

export function parseCifStructure(cifText: string): ParsedCrystalStructure {
  const lines = cifText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cell = {
    a: getNumericTag(lines, "_cell_length_a"),
    b: getNumericTag(lines, "_cell_length_b"),
    c: getNumericTag(lines, "_cell_length_c"),
    alpha: getNumericTag(lines, "_cell_angle_alpha"),
    beta: getNumericTag(lines, "_cell_angle_beta"),
    gamma: getNumericTag(lines, "_cell_angle_gamma")
  };

  const atomHeaderStart = lines.findIndex((line, index) =>
    line === "loop_" && lines[index + 1]?.startsWith("_atom_site_")
  );
  if (atomHeaderStart < 0) {
    throw new Error("CIF atom-site loop not found");
  }

  const headers: string[] = [];
  let cursor = atomHeaderStart + 1;
  while (cursor < lines.length && lines[cursor].startsWith("_atom_site_")) {
    headers.push(lines[cursor]);
    cursor += 1;
  }

  const elementIndex = headerIndex(headers, "_atom_site_type_symbol");
  const labelIndex = headerIndex(headers, "_atom_site_label");
  const xIndex = headerIndex(headers, "_atom_site_fract_x");
  const yIndex = headerIndex(headers, "_atom_site_fract_y");
  const zIndex = headerIndex(headers, "_atom_site_fract_z");
  const atoms: CrystalAtom[] = [];

  while (cursor < lines.length && !lines[cursor].startsWith("_") && lines[cursor] !== "loop_") {
    const tokens = tokenizeCifLine(lines[cursor]);
    if (tokens.length > Math.max(elementIndex, labelIndex, xIndex, yIndex, zIndex)) {
      atoms.push({
        element: tokens[elementIndex],
        label: tokens[labelIndex],
        fract: [
          parseCifNumber(tokens[xIndex]),
          parseCifNumber(tokens[yIndex]),
          parseCifNumber(tokens[zIndex])
        ]
      });
    }
    cursor += 1;
  }

  return { cell, atoms };
}

export function cellToVectors(cell: CrystalCell): [[number, number, number], [number, number, number], [number, number, number]] {
  const alpha = degreesToRadians(cell.alpha);
  const beta = degreesToRadians(cell.beta);
  const gamma = degreesToRadians(cell.gamma);
  const ax: [number, number, number] = [cell.a, 0, 0];
  const bx: [number, number, number] = [cell.b * Math.cos(gamma), cell.b * Math.sin(gamma), 0];
  const cx = cell.c * Math.cos(beta);
  const cy = cell.c * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma)) / Math.sin(gamma);
  const czSquared = Math.max(cell.c * cell.c - cx * cx - cy * cy, 0);
  const cz = Math.sqrt(czSquared);
  return [ax, bx, [cx, cy, cz]];
}

export function fractionalToCartesian(
  fract: [number, number, number],
  vectors: [[number, number, number], [number, number, number], [number, number, number]]
) {
  return [
    fract[0] * vectors[0][0] + fract[1] * vectors[1][0] + fract[2] * vectors[2][0],
    fract[0] * vectors[0][1] + fract[1] * vectors[1][1] + fract[2] * vectors[2][1],
    fract[0] * vectors[0][2] + fract[1] * vectors[1][2] + fract[2] * vectors[2][2]
  ] as [number, number, number];
}

export function formatParameterGroup(value: unknown) {
  if (!value || typeof value !== "object") {
    return "-";
  }

  const entries = Object.entries(value as Record<string, UnitLike>)
    .filter(([, item]) => item && typeof item === "object" && "value" in item)
    .map(([key, item]) => {
      if (item.value === null || item.value === undefined || item.value === "") {
        return `${key}=-`;
      }
      return `${key}=${formatParameterValue(item.value)} ${formatUnit(item.unit)}`.trim();
    });

  return entries.length > 0 ? entries.join(", ") : "-";
}

function formatParameterValue(value: unknown) {
  if (typeof value !== "number") {
    return String(value);
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function getNumericTag(lines: string[], tag: string) {
  const line = lines.find((candidate) => candidate.startsWith(tag));
  if (!line) {
    throw new Error(`Missing CIF tag ${tag}`);
  }
  return parseCifNumber(line.slice(tag.length).trim().split(/\s+/)[0]);
}

function headerIndex(headers: string[], name: string) {
  const index = headers.findIndex((header) => header === name);
  if (index < 0) {
    throw new Error(`Missing CIF atom header ${name}`);
  }
  return index;
}

function tokenizeCifLine(line: string) {
  const matches = line.match(/'[^']*'|"[^"]*"|\S+/g);
  return (matches ?? []).map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function parseCifNumber(value: string) {
  const parsed = Number(value.replace(/\(.+\)$/, ""));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid CIF number ${value}`);
  }
  return parsed;
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function formatUnit(unit: unknown) {
  if (unit === "angstrom") {
    return "Å";
  }
  if (unit === "degree") {
    return "°";
  }
  return typeof unit === "string" ? unit : "";
}
