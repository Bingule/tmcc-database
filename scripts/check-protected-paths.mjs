import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const protectedPatterns = [
  /^src\/components\/Cv[^/]*\.(?:ts|tsx)$/i,
  /^src\/lib\/cv[^/]*\.(?:ts|tsx)$/i,
  /^src\/pages\/CvKineticsPage\.tsx$/i,
  /^src\/tools\/rate-performance\//i,
  /^(?:src|public)\/data\//i,
  /^(?:data|database)\//i,
  /^scripts\/(?:validate-data|backfill-[^/]*|import-[^/]*)\.(?:js|mjs|cjs|ps1)$/i
];

export function findProtectedPaths(paths) {
  return paths
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => protectedPatterns.some((pattern) => pattern.test(path)));
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("Usage: node scripts/check-protected-paths.mjs <base> <head>");
    process.exitCode = 2;
    return;
  }

  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`], {
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean);
  const protectedPaths = findProtectedPaths(changed);

  if (protectedPaths.length > 0) {
    console.error("Protected-path audit failed. The following scientific/data files changed:");
    for (const path of protectedPaths) console.error(path);
    process.exitCode = 1;
    return;
  }

  console.log("Protected-path audit passed");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
