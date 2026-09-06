// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("feedback Worker deployment workflow", () => {
  it("invokes the package deploy script instead of pnpm's deploy command", async () => {
    const workflow = await readFile(".github/workflows/deploy-feedback-worker.yml", "utf8");

    expect(workflow).toContain("pnpm --dir services/feedback-worker run deploy");
  });
});
