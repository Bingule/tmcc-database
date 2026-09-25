declare module "node:fs/promises" {
  interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
  }

  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  export function rm(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "*.mjs" {
  export function createRouteEntries(distPath: string): Promise<void>;
  export function findProtectedPaths(paths: string[]): string[];
}
