import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, downloadPng, downloadSvg, rowsToCsv } from "../src/lib/toolExport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("rowsToCsv", () => {
  it("uses RFC-style escaping, CRLF rows, and locale-invariant finite numbers", () => {
    const localeSpy = vi.spyOn(Number.prototype, "toLocaleString").mockReturnValue("1,5");
    const csv = rowsToCsv(
      ["Potential", "Label", "Value"],
      [[1.5, 'quoted "value", next', null], [-2.5e-7, "line\nbreak", Number.POSITIVE_INFINITY]]
    );

    expect(csv).toBe(
      'Potential,Label,Value\r\n' +
      '1.5,"quoted ""value"", next",\r\n' +
      '-2.5e-7,"line\nbreak",'
    );
    expect(localeSpy).not.toHaveBeenCalled();
  });
});

describe("browser downloads", () => {
  function installUrlMocks() {
    const created: Blob[] = [];
    const revoked: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        created.push(blob);
        return `blob:test-${created.length}`;
      }),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url))
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    return { created, revoked, click };
  }

  it("downloads CSV and revokes its object URL", async () => {
    const mocks = installUrlMocks();
    downloadCsv("results.csv", "a,b\r\n1,2");

    expect(mocks.click).toHaveBeenCalledOnce();
    expect(mocks.created[0].type).toBe("text/csv;charset=utf-8");
    await expect(readBlob(mocks.created[0])).resolves.toBe("a,b\r\n1,2");
    expect(mocks.revoked).toEqual(["blob:test-1"]);
  });

  it("clones and serializes SVG before downloading and always revokes the URL", async () => {
    const mocks = installUrlMocks();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));

    downloadSvg(svg, "plot.svg");

    expect(mocks.click).toHaveBeenCalledOnce();
    expect(mocks.created[0].type).toBe("image/svg+xml;charset=utf-8");
    await expect(readBlob(mocks.created[0])).resolves.toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(mocks.revoked).toEqual(["blob:test-1"]);
    expect(svg.hasAttribute("xmlns")).toBe(false);
  });

  it("renders SVG at 2x to PNG and revokes both object URLs", async () => {
    const mocks = installUrlMocks();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 60");
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    class LoadingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", LoadingImage);

    await downloadPng(svg, "plot.png");

    expect(drawImage).toHaveBeenCalledWith(expect.any(LoadingImage), 0, 0, 240, 120);
    expect(mocks.click).toHaveBeenCalledOnce();
    expect(mocks.created.map((blob) => blob.type)).toEqual(["image/svg+xml;charset=utf-8", "image/png"]);
    expect(mocks.revoked).toEqual(["blob:test-2", "blob:test-1"]);
  });

  it("rejects image load failures while still cleaning the SVG object URL", async () => {
    const mocks = installUrlMocks();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    class FailingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", FailingImage);

    await expect(downloadPng(svg, "plot.png")).rejects.toThrow("Unable to load SVG image");
    expect(mocks.revoked).toEqual(["blob:test-1"]);
  });

  it("rejects a missing canvas context and revokes the SVG object URL", async () => {
    const mocks = installUrlMocks();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    class LoadingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", LoadingImage);

    await expect(downloadPng(svg, "plot.png")).rejects.toThrow("Canvas rendering is unavailable");
    expect(mocks.revoked).toEqual(["blob:test-1"]);
    expect(document.querySelector("a")).toBeNull();
  });

  it("rejects an empty PNG blob and revokes the SVG object URL", async () => {
    const mocks = installUrlMocks();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 50");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    class LoadingImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", LoadingImage);

    await expect(downloadPng(svg, "plot.png")).rejects.toThrow("Unable to create PNG image");
    expect(mocks.revoked).toEqual(["blob:test-1"]);
    expect(document.querySelector("a")).toBeNull();
  });

  it("removes the anchor and revokes the URL when a download click throws", () => {
    const mocks = installUrlMocks();
    mocks.click.mockImplementation(() => { throw new Error("blocked"); });

    expect(() => downloadCsv("results.csv", "a\r\n1")).toThrow("blocked");
    expect(mocks.revoked).toEqual(["blob:test-1"]);
    expect(document.querySelector("a")).toBeNull();
  });
});
