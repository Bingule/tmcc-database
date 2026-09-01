import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createRouteEntries } from "../scripts/create-route-entries.mjs";
import { normalizePathname } from "../src/lib/routes";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

it("registers Reviewer Two as a standalone Tools route", async () => {
  expect(normalizePathname("/tools/reviewer-two")).toBe("reviewerTwo");
  expect(normalizePathname("/tools/reviewer-two/")).toBe("reviewerTwo");

  const distPath = await mkdtemp(join(tmpdir(), "tmcc-reviewer-two-route-"));
  temporaryDirectories.push(distPath);
  const html = "<!doctype html><html><body>TMCC</body></html>";
  await writeFile(join(distPath, "index.html"), html, "utf8");

  await createRouteEntries(distPath);

  expect(await readFile(join(distPath, "tools/reviewer-two/index.html"), "utf8"))
    .toBe(html);
});
