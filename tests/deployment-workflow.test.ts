// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feedback Worker deployment workflow", () => {
  it("invokes the package deploy script instead of pnpm's deploy command", () => {
    const workflow = readFileSync(".github/workflows/deploy-feedback-worker.yml", "utf8");

    expect(workflow).toContain("pnpm --dir services/feedback-worker run deploy");
  });
});
