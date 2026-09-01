import katex from "katex";
import "katex/dist/katex.min.css";

const SYMBOL_TEX: Readonly<Record<string, string>> = {
  Q_M: String.raw`Q_{\mathrm{M}}`,
  R_T: String.raw`R_{\mathrm{T}}`,
  tau: String.raw`\tau`,
  "τ": String.raw`\tau`,
  tau_total: String.raw`\tau_{\mathrm{total}}`,
  "τ_total": String.raw`\tau_{\mathrm{total}}`,
  tau_C: String.raw`\tau_{\mathrm{C}}`,
  "τ_C": String.raw`\tau_{\mathrm{C}}`,
  tau_D: String.raw`\tau_{\mathrm{D}}`,
  "τ_D": String.raw`\tau_{\mathrm{D}}`,
  t_c: String.raw`t_{\mathrm{c}}`,
  I_adj: String.raw`I_{\mathrm{adj}}`,
  P_avg: String.raw`P_{\mathrm{avg}}`,
  "E, P_avg": String.raw`E,\ P_{\mathrm{avg}}`,
  "Δt": String.raw`\Delta t`,
  L_E: String.raw`L_{\mathrm{E}}`,
  L_S: String.raw`L_{\mathrm{S}}`,
  L_AM: String.raw`L_{\mathrm{AM}}`,
  "C_V,eff": String.raw`C_{\mathrm{V,eff}}`,
  sigma_E: String.raw`\sigma_{\mathrm{E}}`,
  sigma_BL: String.raw`\sigma_{\mathrm{BL}}`,
  P_E: String.raw`P_{\mathrm{E}}`,
  P_S: String.raw`P_{\mathrm{S}}`,
  D_BL: String.raw`D_{\mathrm{BL}}`,
  D_AM: String.raw`D_{\mathrm{AM}}`,
  "τ_Eq.6a": String.raw`\tau_{\mathrm{Eq.\,6a}}`,
};

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  alpha: "ᵅ",
};

export interface ScientificMathProps {
  readonly tex: string;
  readonly source: string;
  readonly label?: string;
  readonly display?: boolean;
  readonly className?: string;
}

export function ScientificMath({ tex, source, label, display = false, className }: ScientificMathProps) {
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      output: "htmlAndMathml",
      strict: "error",
      throwOnError: true,
      trust: false,
    });
  } catch {
    return display
      ? <div className={className} role="math" aria-label={label ?? source}>{source}</div>
      : <span className={className} role="math" aria-label={label ?? source}>{source}</span>;
  }

  const shared = {
    className,
    role: "math",
    "aria-label": label ?? source,
    "data-math-source": source,
    dangerouslySetInnerHTML: { __html: html },
  } as const;
  return display ? <div {...shared} /> : <span {...shared} />;
}

export function ScientificSymbol({ value, className }: { value: string; className?: string }) {
  const tex = SYMBOL_TEX[value];
  return tex
    ? <ScientificMath tex={tex} source={value} label={value} className={className} />
    : <span className={className}>{value}</span>;
}

export function formatScientificUnit(unit: string): string {
  return unit.replace(/\^(-?(?:\d+|alpha))/g, (_match, exponent: string) => {
    if (exponent === "alpha" || exponent === "-alpha") {
      return `${exponent.startsWith("-") ? SUPERSCRIPTS["-"] : ""}${SUPERSCRIPTS.alpha}`;
    }
    return [...exponent].map((character) => SUPERSCRIPTS[character] ?? character).join("");
  });
}

export function formatScientificUnitCode(unit: string): string {
  const display = unit
    .replace("mAh-g-1", "mAh g^-1")
    .replace("Ah-kg-1", "Ah kg^-1")
    .replace("mA-g-1", "mA g^-1")
    .replace("A-g-1", "A g^-1")
    .replace("h-1", "h^-1");
  return formatScientificUnit(display);
}

export function ScientificUnit({ value, className }: { value: string; className?: string }) {
  return <span className={["scientific-unit", className].filter(Boolean).join(" ")}>{formatScientificUnit(value)}</span>;
}
