import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import type { SalesReport } from '@/domain/services';
import type { AppSettings } from '@/domain/models/settings';
import { formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent } from '@/utils/format';

type Rgb = [number, number, number];

// Same validated chart slots and chrome as the on-screen report.
const SALES: Rgb = [42, 120, 214]; // #2a78d6
const PROFIT: Rgb = [27, 175, 122]; // #1baf7a
const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [100, 116, 139];
const TRACK: Rgb = [241, 245, 249];
const BRAND: Rgb = [15, 105, 97];
const LOSS: Rgb = [225, 29, 72];

const PAGE_MARGIN = 14;

/** Right-aligns header/footer cells of numeric columns so they sit over their values. */
const alignNumericHeads =
  (firstNumericColumn: number) =>
  (cell: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
    if ((cell.section === 'head' || cell.section === 'foot') && cell.column.index >= firstNumericColumn) cell.cell.styles.halign = 'right';
  };

/** Amounts without a currency symbol: the built-in PDF fonts cannot render ₹. */
const amount = (value: number) => formatDecimal(value);

interface DocWithTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

export function reportFileName(report: SalesReport): string {
  return `sales-profit-report_${report.period.from}_to_${report.period.to}.pdf`;
}

/** Builds the report and triggers the browser download. */
export async function exportSalesReportPdf(report: SalesReport, settings: AppSettings, generatedBy: string): Promise<void> {
  buildSalesReportPdf(report, settings, generatedBy).save(reportFileName(report));
}

/**
 * Builds the sales & profit report as a vector PDF (selectable text, crisp
 * charts). Charts are drawn with PDF primitives so the file is small and
 * prints cleanly.
 */
export function buildSalesReportPdf(report: SalesReport, settings: AppSettings, generatedBy: string): jsPDF {
  const doc: DocWithTable = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };
  const text = (value: string, x: number, at: number, options: { size?: number; bold?: boolean; color?: Rgb; align?: 'left' | 'right' | 'center' } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size ?? 9);
    doc.setTextColor(...(options.color ?? INK));
    doc.text(value, x, at, { align: options.align ?? 'left' });
  };

  // ------------------------------------------------------------- header
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 3, 'F');
  y += 4;
  text(settings.businessName, PAGE_MARGIN, y, { size: 15, bold: true });
  text(`Amounts in ${settings.currency}`, pageWidth - PAGE_MARGIN, y, { size: 8, color: MUTED, align: 'right' });
  y += 6;
  text('Sales & Profit Report', PAGE_MARGIN, y, { size: 11, bold: true, color: BRAND });
  y += 5;
  const range = report.period.from === report.period.to ? formatDate(report.period.from) : `${formatDate(report.period.from)} – ${formatDate(report.period.to)}`;
  text(`${report.period.label}: ${range}`, PAGE_MARGIN, y, { size: 9, color: MUTED });
  text(`Generated ${formatDateTime(report.generatedAt)}${generatedBy ? ` by ${generatedBy}` : ''}`, pageWidth - PAGE_MARGIN, y, {
    size: 8,
    color: MUTED,
    align: 'right',
  });
  y += 7;

  // ------------------------------------------------------------- KPI tiles
  const tiles: Array<[string, string]> = [
    ['Sales', amount(report.totals.sales)],
    ['Purchase cost', amount(report.totals.cost)],
    ['Profit', amount(report.totals.profit)],
    ['Margin', formatPercent(report.totals.margin)],
    ['Bills', formatNumber(report.billCount)],
    ['Units sold', formatNumber(report.totals.quantity)],
  ];
  const tileGap = 3;
  const tileWidth = (contentWidth - tileGap * 2) / 3;
  tiles.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = PAGE_MARGIN + column * (tileWidth + tileGap);
    const top = y + row * 17;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(label === 'Profit' ? 239 : 255, label === 'Profit' ? 252 : 255, label === 'Profit' ? 249 : 255);
    doc.roundedRect(x, top, tileWidth, 14, 2, 2, 'FD');
    text(label, x + 3, top + 5, { size: 7.5, color: MUTED });
    text(value, x + 3, top + 11, { size: 11, bold: true });
  });
  y += 17 * 2 + 4;

  // ------------------------------------------------------------- charts
  const barChart = (title: string, rows: Array<{ label: string; value: number; display: string }>, color: Rgb, x: number, width: number, top: number) => {
    text(title, x, top, { size: 9, bold: true });
    const max = Math.max(0, ...rows.map((row) => row.value));
    let rowY = top + 5;
    for (const row of rows) {
      text(row.label, x, rowY, { size: 7.5 });
      text(row.display, x + width, rowY, { size: 7.5, bold: true, align: 'right', color: row.value < 0 ? LOSS : INK });
      doc.setFillColor(...TRACK);
      doc.rect(x, rowY + 1.2, width, 2.4, 'F');
      const barWidth = max > 0 ? Math.max(0, (row.value / max) * width) : 0;
      if (barWidth > 0) {
        doc.setFillColor(...color);
        doc.roundedRect(x, rowY + 1.2, barWidth, 2.4, 0.8, 0.8, 'F');
      }
      rowY += 8;
    }
    return rowY;
  };

  const chartRows = report.vendors.slice(0, 8);
  ensureSpace(10 + chartRows.length * 8);
  const half = (contentWidth - 8) / 2;
  const salesEnd = barChart(
    'Sales by vendor',
    chartRows.map((vendor) => ({ label: `${vendor.vendorName} (${formatPercent(vendor.share)})`, value: vendor.sales, display: amount(vendor.sales) })),
    SALES,
    PAGE_MARGIN,
    half,
    y,
  );
  const profitEnd = barChart(
    'Profit by vendor',
    chartRows.map((vendor) => ({ label: `${vendor.vendorName} (${formatPercent(vendor.margin)} margin)`, value: vendor.profit, display: amount(vendor.profit) })),
    PROFIT,
    PAGE_MARGIN + half + 8,
    half,
    y,
  );
  y = Math.max(salesEnd, profitEnd) + 2;

  // Daily sales columns (multi-day periods up to ~2 months).
  if (report.daily.length > 1 && report.daily.length <= 62) {
    const chartHeight = 32;
    ensureSpace(chartHeight + 16);
    text('Sales per day', PAGE_MARGIN, y, { size: 9, bold: true });
    const top = y + 3;
    const baseline = top + chartHeight;
    const max = Math.max(0, ...report.daily.map((day) => day.sales));
    const band = contentWidth / report.daily.length;
    const barWidth = Math.min(5, band * 0.6);
    doc.setDrawColor(203, 213, 225);
    doc.line(PAGE_MARGIN, baseline, PAGE_MARGIN + contentWidth, baseline);
    report.daily.forEach((day, index) => {
      const height = max > 0 ? (day.sales / max) * chartHeight : 0;
      const x = PAGE_MARGIN + band * index + (band - barWidth) / 2;
      if (height > 0) {
        doc.setFillColor(...SALES);
        doc.rect(x, baseline - height, barWidth, height, 'F');
      }
      const every = Math.ceil(report.daily.length / 10);
      if (index % every === 0) text(formatDate(day.date).slice(0, 6), x + barWidth / 2, baseline + 4, { size: 6.5, color: MUTED, align: 'center' });
    });
    text(`Peak ${amount(max)}`, PAGE_MARGIN + contentWidth, y, { size: 7, color: MUTED, align: 'right' });
    y = baseline + 9;
  }

  // ------------------------------------------------------------- vendor summary table
  const right = { halign: 'right' as const };
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [['Vendor', 'Qty', 'Sales', 'Cost', 'Profit', 'Margin', 'Share']],
    body: report.vendors.map((vendor) => [
      vendor.vendorName,
      formatNumber(vendor.quantity),
      amount(vendor.sales),
      amount(vendor.cost),
      amount(vendor.profit),
      formatPercent(vendor.margin),
      formatPercent(vendor.share),
    ]),
    foot: [['Total', formatNumber(report.totals.quantity), amount(report.totals.sales), amount(report.totals.cost), amount(report.totals.profit), formatPercent(report.totals.margin), '100%']],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.6, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255] },
    footStyles: { fillColor: [226, 232, 240], textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right, 6: right },
    didParseCell: alignNumericHeads(1),
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // ------------------------------------------------------------- per-vendor detail
  for (const vendor of report.vendors) {
    ensureSpace(24);
    text(vendor.vendorName, PAGE_MARGIN, y, { size: 11, bold: true, color: BRAND });
    text(
      `Sales ${amount(vendor.sales)}  ·  Profit ${amount(vendor.profit)}  ·  Margin ${formatPercent(vendor.margin)}`,
      pageWidth - PAGE_MARGIN,
      y,
      { size: 8, color: MUTED, align: 'right' },
    );
    y += 2;
    const categoryRowIndexes = new Set<number>();
    const body: RowInput[] = [];
    for (const category of vendor.categories) {
      categoryRowIndexes.add(body.length);
      body.push([
        category.categoryName,
        '',
        formatNumber(category.quantity),
        '',
        amount(category.sales),
        amount(category.cost),
        amount(category.profit),
        formatPercent(category.margin),
      ]);
      for (const product of category.products) {
        body.push([
          `   ${product.productName}`,
          product.unit,
          formatNumber(product.quantity),
          amount(product.averageRate),
          amount(product.sales),
          amount(product.cost),
          amount(product.profit),
          formatPercent(product.margin),
        ]);
      }
    }
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Category / product', 'Unit', 'Qty', 'Avg rate', 'Sales', 'Cost', 'Profit', 'Margin']],
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.4, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: 'bold' },
      columnStyles: { 2: right, 3: right, 4: right, 5: right, 6: right, 7: right },
      didParseCell: (cell) => {
        alignNumericHeads(2)(cell);
        if (cell.section !== 'body') return;
        if (categoryRowIndexes.has(cell.row.index)) {
          cell.cell.styles.fontStyle = 'bold';
          cell.cell.styles.fillColor = [248, 250, 252];
        }
        const raw = String(cell.cell.raw ?? '');
        if ((cell.column.index === 6 || cell.column.index === 7) && raw.startsWith('-')) cell.cell.styles.textColor = LOSS;
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  // ------------------------------------------------------------- footer on every page
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    text('Profit = sales - purchase cost recorded on each saved bill. Invalid bills are excluded.', PAGE_MARGIN, pageHeight - 8, { size: 7, color: MUTED });
    text(`Page ${page} of ${pages}`, pageWidth - PAGE_MARGIN, pageHeight - 8, { size: 7, color: MUTED, align: 'right' });
  }

  return doc;
}
