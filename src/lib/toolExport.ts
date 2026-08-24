export function rowsToCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  downloadBlob(makeSvgBlob(svg), filename);
}

export async function downloadPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const { width, height } = svgDimensions(svg);
  const svgUrl = URL.createObjectURL(makeSvgBlob(svg));
  let pngUrl: string | null = null;

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await canvasToBlob(canvas);
    pngUrl = URL.createObjectURL(png);
    clickDownload(pngUrl, filename);
  } finally {
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    URL.revokeObjectURL(svgUrl);
  }
}

function csvCell(value: string | number | null): string {
  let text = "";
  if (typeof value === "number") text = Number.isFinite(value) ? String(value) : "";
  else if (value !== null) text = value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeSvgBlob(svg: SVGSVGElement): Blob {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    clickDownload(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clickDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}

function svgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: Math.ceil(viewBox[2]), height: Math.ceil(viewBox[3]) };
  }
  const width = Number.parseFloat(svg.getAttribute("width") ?? "");
  const height = Number.parseFloat(svg.getAttribute("height") ?? "");
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width: Math.ceil(width), height: Math.ceil(height) };
  }
  throw new Error("SVG dimensions are unavailable");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load SVG image"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to create PNG image"));
    }, "image/png");
  });
}
