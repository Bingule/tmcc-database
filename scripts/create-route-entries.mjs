import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const routeEntries = [
  "tools/index.html",
  "tools/cv-kinetics/index.html",
  "tools/theoretical-capacity/index.html",
  "tools/molecular-weight/index.html"
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
