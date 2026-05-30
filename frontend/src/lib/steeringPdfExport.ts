import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";

export function projectNameToSlug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").substring(0, 40);
}

export async function captureElementToPng(el: HTMLElement): Promise<string> {
  const width = el.scrollWidth || el.clientWidth;
  const height = el.scrollHeight || el.clientHeight;
  return toPng(el, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    width,
    height,
    cacheBust: true,
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

async function addImageVerticalPages(
  pdf: jsPDF,
  png: string,
  x: number,
  startY: number,
  targetWidth: number,
  pageContentHeight: number,
): Promise<void> {
  const img = await loadImage(png);
  const scale = targetWidth / img.width;
  const scaledHeight = img.height * scale;
  const sliceHeightPx = pageContentHeight / scale;

  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < img.height) {
    if (pageIndex > 0) {
      pdf.addPage("a4", "landscape");
    }

    const sliceH = Math.min(sliceHeightPx, img.height - sourceY);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = sliceH;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(img, 0, sourceY, img.width, sliceH, 0, 0, img.width, sliceH);
    const slicePng = canvas.toDataURL("image/png");
    const sliceScaledH = sliceH * scale;
    pdf.addImage(slicePng, "PNG", x, startY, targetWidth, sliceScaledH);

    sourceY += sliceH;
    pageIndex++;
  }
}

export interface BuildSteeringPdfOptions {
  projectName: string;
  locale: string;
  generatedAt: string;
  steeringPng: string;
  ganttPng: string | null;
  ganttTitle: string;
  noGanttMessage: string;
}

export async function downloadSteeringPdf(options: BuildSteeringPdfOptions): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 10;
  const pageW = pdf.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;

  pdf.setFontSize(16);
  pdf.text(options.projectName, margin, margin + 6);
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  const dateStr = new Date(options.generatedAt).toLocaleString(
    options.locale === "fr" ? "fr-FR" : "en-US",
  );
  pdf.text(dateStr, margin, margin + 12);
  pdf.setTextColor(0);

  const steeringProps = pdf.getImageProperties(options.steeringPng);
  const steeringH = (steeringProps.height * contentW) / steeringProps.width;
  pdf.addImage(options.steeringPng, "PNG", margin, margin + 16, contentW, steeringH);

  if (options.ganttPng) {
    pdf.addPage("a4", "landscape");
    const landscapeW = pdf.internal.pageSize.getWidth();
    const landscapeH = pdf.internal.pageSize.getHeight();
    const ganttMargin = 10;
    const ganttContentW = landscapeW - ganttMargin * 2;
    const startY = ganttMargin + 10;
    const pageContentHeight = landscapeH - startY - ganttMargin;

    pdf.setFontSize(12);
    pdf.text(options.ganttTitle, ganttMargin, ganttMargin + 4);

    await addImageVerticalPages(
      pdf,
      options.ganttPng,
      ganttMargin,
      startY,
      ganttContentW,
      pageContentHeight,
    );
  } else {
    let y = margin + 16 + steeringH + 8;
    if (y > pdf.internal.pageSize.getHeight() - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    pdf.text(options.noGanttMessage, margin, y);
    pdf.setTextColor(0);
  }

  const slug = projectNameToSlug(options.projectName);
  pdf.save(`wroket-steering-${slug}.pdf`);
}
