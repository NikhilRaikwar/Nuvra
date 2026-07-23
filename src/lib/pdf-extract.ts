import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export async function extractPdfText(file: File): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("PDF parsing is available only in the browser.");
  }

  // pdfjs depends on browser DOM APIs, so loading it at module scope breaks SSR.
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    chunks.push(text);
  }
  return chunks
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
