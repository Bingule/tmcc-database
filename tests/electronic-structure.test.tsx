import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ElectronicPlot, ElectronicStructureViewer, parseDosCsv } from "../src/components/ElectronicStructureViewer";
import type { MaterialRecord } from "../src/lib/types";

describe("ElectronicStructureViewer", () => {
  it("parses total and projected DOS columns as separate curves", () => {
    const series = parseDosCsv(
      [
        "energy_ev,total_up,total_down,Nb_d_up,S_p_up",
        "-1,2,-1,0.4,0.2",
        "0,3,-2,0.6,0.3"
      ].join("\n")
    );

    expect(series.map((item) => item.label)).toEqual(["Total up", "Total down", "Nb d up", "S p up"]);
    expect(series[1].points[0]).toEqual({ x: -1, y: -1 });
  });

  it("offers the DOS CSV for download when curve data is configured", () => {
    const material = {
      files: { dos: "/figures/TMCC-0001/dos.csv", band_structure: null }
    } as MaterialRecord;

    const markup = renderToStaticMarkup(<ElectronicStructureViewer material={material} />);

    expect(markup).toContain('href="/figures/TMCC-0001/dos.csv"');
    expect(markup).toContain("Download DOS CSV");
  });

  it("places the curve legend above the plot and shows the real Fermi level separately", () => {
    const markup = renderToStaticMarkup(
      <ElectronicPlot
        series={[
          { label: "Total up", points: [{ x: -6, y: 0 }, { x: 0, y: 2 }, { x: 6, y: 1 }] },
          { label: "Nb d up", points: [{ x: -6, y: 0 }, { x: 0, y: 1 }, { x: 6, y: 0.5 }] }
        ]}
        xLabel="Energy - Ef (eV)"
        yLabel="DOS"
        fermiReference="vertical"
        fermiLevel={5.4321}
        fixedXRange={[-6, 6]}
      />
    );

    expect(markup).toContain("electronic-legend top-legend");
    expect(markup).toContain("Ef = 5.432 eV");
    expect(markup).toContain(">Ef</text>");
    expect(markup).not.toContain("translate(52, 299)");
  });
});
