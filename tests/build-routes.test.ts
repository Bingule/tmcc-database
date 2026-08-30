import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRouteEntries } from "../scripts/create-route-entries.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("createRouteEntries", () => {
  it("copies the root entry into every standalone Tools route", async () => {
    const distPath = await mkdtemp(join(tmpdir(), "tmcc-routes-"));
    temporaryDirectories.push(distPath);
    const html = "<!doctype html><html><body>TMCC</body></html>";
    await writeFile(join(distPath, "index.html"), html, "utf8");

    await createRouteEntries(distPath);

    await Promise.all([
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
    ].map(async (routeEntry) => {
      expect(await readFile(join(distPath, routeEntry), "utf8")).toBe(html);
    }));
  });
});
