export type ImportTotals = {
  complete: number;
  stable: number;
  unstable: number;
  pending: number;
};

export type ImportOptions = {
  manifestPath: string;
  sourceRoot: string;
  dataRoot: string;
  publicRoot: string;
  dryRun?: boolean;
  expectedTotals?: ImportTotals;
};

export function runImport(options: ImportOptions): Promise<ImportTotals>;
