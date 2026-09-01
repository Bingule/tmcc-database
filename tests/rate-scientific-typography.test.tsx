import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  ScientificMath,
  ScientificSymbol,
  ScientificUnit,
  formatScientificUnit,
} from "../src/tools/rate-performance/components/ScientificTypography";

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});

async function render(ui: React.ReactNode) {
  const view = document.createElement("div");
  document.body.appendChild(view);
  const root = createRoot(view);
  roots.push(root);
  await act(async () => root.render(ui));
  return view;
}

describe("Rate Performance scientific typography", () => {
  it("renders block equations as KaTeX HTML plus MathML", async () => {
    const view = await render(
      <ScientificMath
        tex={String.raw`Q(R)=Q_{\mathrm{M}}\left[1-(R\tau)^n\right]`}
        source="Q(R) = Q_M [1 - (R tau)^n]"
        label="Rate model equation"
        display
      />,
    );

    expect(view.querySelector(".katex-display")).not.toBeNull();
    expect(view.querySelector("math")).not.toBeNull();
    expect(view.querySelector('[role="math"]')?.getAttribute("aria-label")).toBe("Rate model equation");
  });

  it("renders known parameter symbols with scientific subscripts", async () => {
    const view = await render(<><ScientificSymbol value="Q_M" /> <ScientificSymbol value="R_T" /></>);
    expect(view.querySelectorAll(".katex")).toHaveLength(2);
    expect(view.textContent).toContain("QM");
    expect(view.textContent).toContain("RT");
  });

  it("formats caret units with Unicode superscripts", async () => {
    expect(formatScientificUnit("mAh g^-1")).toBe("mAh g⁻¹");
    expect(formatScientificUnit("A m^-2")).toBe("A m⁻²");
    expect(formatScientificUnit("m^-alpha")).toBe("m⁻ᵅ");

    const view = await render(<ScientificUnit value="Wh kg^-1" />);
    expect(view.textContent).toBe("Wh kg⁻¹");
  });

  it("falls back to the readable source when TeX is invalid", async () => {
    const view = await render(<ScientificMath tex={String.raw`\notARealCommand{`} source="Readable equation" />);
    expect(view.textContent).toBe("Readable equation");
    expect(view.querySelector(".katex")).toBeNull();
  });
});
