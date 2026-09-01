import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  ScientificMath,
  ScientificSymbol,
  ScientificUnit,
  formatScientificUnit,
} from "../src/tools/rate-performance/components/ScientificTypography";
import { RATE_DISPLAY_EQUATIONS } from "../src/tools/rate-performance/models/displayEquations";
import { getRateModel } from "../src/tools/rate-performance/models/registry";
import { transportEquationTex } from "../src/tools/rate-performance/components/transportTimePresentation";
import { en, type TranslationKey } from "../src/locales/en";
import { zh } from "../src/locales/zh";

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
    expect(view.querySelectorAll("math")).toHaveLength(2);
    expect(view.querySelectorAll('[aria-label="Q_M"], [aria-label="R_T"]')).toHaveLength(0);
    expect(view.textContent).toContain("QM");
    expect(view.textContent).toContain("RT");
  });

  it("keeps exact, reviewed TeX for every implemented equation family", () => {
    expect(getRateModel("tian-characteristic-time")?.equationTex).toBe(
      String.raw`Q(R)=Q_{\mathrm{M}}\left[1-(R\tau)^n\left(1-\exp\left(-(R\tau)^{-n}\right)\right)\right]`,
    );
    expect(getRateModel("rational-characteristic-time")?.equationTex).toBe(
      String.raw`Q(R)=\frac{Q_{\mathrm{M}}}{1+2(R\tau)^n}`,
    );
    expect(RATE_DISPLAY_EQUATIONS.transitionRate.tex).toBe(String.raw`R_{\mathrm T}=\frac{(1/2)^{1/n}}{\tau}`);
    expect(RATE_DISPLAY_EQUATIONS.ca.tex).toContain(String.raw`\int_0^t I_{\mathrm{adj}}(t')\,\mathrm{d}t'`);
    expect(RATE_DISPLAY_EQUATIONS.energy.tex).toBe(String.raw`E=\int V\,\mathrm{d}Q\qquad P_{\mathrm{avg}}=\frac{E}{\Delta t}`);
    expect(RATE_DISPLAY_EQUATIONS.transport.tex).toContain(String.raw`\frac{C_{\mathrm{V,eff}}}{2\sigma_{\mathrm{BL}}P_{\mathrm E}^{3/2}}`);
    expect(RATE_DISPLAY_EQUATIONS.thickness.linear.tex).toBe(String.raw`\tau=b_0+b_1L`);
    expect(RATE_DISPLAY_EQUATIONS.thickness.quadratic.tex).toBe(String.raw`\tau=b_0+b_2L^2`);
    expect(RATE_DISPLAY_EQUATIONS.thickness.power.tex).toBe(String.raw`\tau=aL^\alpha`);
    expect(transportEquationTex("electrode-electronic")).toBe(String.raw`\frac{L_{\mathrm{E}}^2 C_{\mathrm{V,eff}}}{2\sigma_{\mathrm{E}}}`);
    expect(transportEquationTex("pore-ionic-electrical")).toBe(String.raw`\frac{L_{\mathrm{E}}^2 C_{\mathrm{V,eff}}}{2\sigma_{\mathrm{BL}}P_{\mathrm{E}}^{3/2}}`);
    expect(transportEquationTex("active-material-diffusion")).toBe(String.raw`\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}`);
  });

  it("uses readable Unicode in native controls and prose where KaTeX cannot render", () => {
    const keys: TranslationKey[] = [
      "rate.transport.inputHelp",
      "rate.transport.electrodeThickness",
      "rate.transport.separatorThickness",
      "rate.transport.activeMaterialLength",
      "rate.transport.volumetricCapacitance",
      "rate.transport.electrodeConductivity",
      "rate.transport.electrolyteConductivity",
      "rate.transport.electrodePorosity",
      "rate.transport.separatorPorosity",
      "rate.transport.electrolyteDiffusivity",
      "rate.transport.activeMaterialDiffusivity",
      "rate.transport.kineticTime",
      "rate.transport.theoryLimits",
      "rate.transport.theoryAssumptionBruggeman",
      "rate.analysis.whatParameters",
      "rate.analysis.limitingBehavior",
      "rate.analysis.assumptionParameters",
      "rate.analysis.rtDefinition",
    ];
    for (const key of keys) {
      expect(en[key]).not.toMatch(/Q_M|R_T|[LCDPσt]_[A-Zc]|\^\(/);
      expect(zh[key]).not.toMatch(/Q_M|R_T|[LCDPσt]_[A-Zc]|\^\(/);
    }
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
