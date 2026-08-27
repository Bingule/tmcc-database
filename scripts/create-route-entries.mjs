import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const routeEntries = [
  "tools/index.html",
  "tools/cv-kinetics/index.html",
  "tools/theoretical-capacity/index.html",
  "tools/molecular-weight/index.html",
  "tools/rate-performance/index.html",
  "tools/rate-performance/model-comparison/index.html",
  "tools/rate-performance/transport-limitations/index.html",
  "tools/rate-performance/characteristic-time/index.html",
  "tools/rate-performance/thickness-kinetics/index.html",
  "tools/rate-performance/ca-analysis/index.html",
  "tools/rate-performance/empirical-models/index.html",
  "tools/rate-performance/energy-power/index.html"
];

export async function createRouteEntries(distPath) {
  const source = join(distPath, "index.html");
  await Promise.all(routeEntries.map(async (routeEntry) => {
    const destination = join(distPath, routeEntry);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }));
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] === scriptPath) {
  await createRouteEntries(join(dirname(scriptPath), "..", "dist"));
}
