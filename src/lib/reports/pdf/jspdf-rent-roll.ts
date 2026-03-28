import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RentRollReportModel } from "@/lib/reports/rent-roll-types";
import type { ProfessionalRentRollPack } from "@/lib/reports/professional-types";
import { eurPdf, resolveLogoDataUrl } from "./jspdf-shared";

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

export async function buildRentRollPdf(
  report: RentRollReportModel,
  pack: ProfessionalRentRollPack,
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  const logo = await resolveLogoDataUrl(pack.meta.logoUrl);
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, margin, y, 58, 7);
      y += 10;
    } catch {
      y += 2;
    }
  } else {
    y += 2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(26, 58, 95);
  doc.text(pack.meta.reportTitle, margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const period = `${pack.meta.periodStart} → ${pack.meta.periodEnd}`;
  doc.text(period, margin, y);
  y += 6;
  const names = pack.meta.propertyLines.map((p) => p.name).join(" · ") || "Portfolio";
  const nameLines = doc.splitTextToSize(names, pageW - 2 * margin);
  doc.text(nameLines, margin, y);
  y += nameLines.length * 5 + 4;

  doc.setFontSize(9);
  doc.text(
    `Generated ${new Date(pack.meta.generatedAtIso).toISOString().slice(0, 16)}Z${pack.meta.generatedByEmail ? ` · ${pack.meta.generatedByEmail}` : ""}`,
    margin,
    y,
  );
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Executive summary", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const ex = pack.executive;
  const exLines = [
    `Revenue (ex-VAT): ${eurPdf(ex.totalRevenueNet)}`,
    `VAT on revenue (indicative): ${eurPdf(ex.vatOnRevenue)}`,
    `Revenue (incl. VAT): ${eurPdf(ex.totalRevenueGross)}`,
    `Annual run-rate (indicative): ${ex.indicativeAnnualRevenueNet != null ? eurPdf(ex.indicativeAnnualRevenueNet) : "—"}`,
    `Occupancy: ${ex.occupancyWeightedPct != null ? `${ex.occupancyWeightedPct}%` : "—"}`,
  ];
  for (const line of exLines) {
    doc.text(line, margin, y);
    y += 5;
  }
  y += 4;

  const monthlySlice = pack.monthlyRevenueVat.slice(0, 36);
  autoTable(doc, {
    startY: y,
    head: [["Month", "Basis", "Net", "VAT", "Gross"]],
    body: monthlySlice.map((r) => [
      r.monthKey,
      r.basis,
      eurPdf(r.total.net),
      eurPdf(r.total.vat),
      eurPdf(r.total.gross),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 58, 95], textColor: 255 },
    margin: { left: margin, right: margin },
    showHead: "everyPage",
  });

  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("VAT summary (indicative)", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Section", "Category", "Rate", "Net", "VAT", "Gross"]],
    body: pack.vatSummaryLines.map((l) => [
      l.section,
      l.category,
      `${(l.ratePct ?? l.rate * 100).toFixed(1)}%`,
      eurPdf(l.net),
      eurPdf(l.vat),
      eurPdf(l.gross),
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 58, 95], textColor: 255 },
    margin: { left: margin, right: margin },
    showHead: "everyPage",
  });

  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
  y += 8;

  if (y > 240) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Data sources", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Months in range: ${report.monthKeys.length}`, margin, y);
  y += 6;
  for (const d of pack.dataSources) {
    if (y > 255) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.text(d.label, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const det = doc.splitTextToSize(d.detail, pageW - 2 * margin);
    doc.text(det, margin, y);
    y += det.length * 4 + 5;
  }

  const totalPages = doc.getNumberOfPages();
  const foot = `${pack.meta.brandName} · Confidential · rent roll`;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${foot} · Page ${i} / ${totalPages}`, margin, doc.internal.pageSize.getHeight() - 10);
  }
  const buf = doc.output("arraybuffer");
  return new Uint8Array(buf);
}
