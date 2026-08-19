import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export interface InvoiceItem {
  name: string;
  quantity: number;
  price: number; // in INR
}

export interface InvoiceOptions {
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  items: InvoiceItem[];
  upiUri: string;
  payeeName: string;
  payeeVpa: string;
  outputPath?: string;
}

export async function generateInvoicePdf(options: InvoiceOptions): Promise<string> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const fileName = `Invoice_${options.invoiceNumber}.pdf`;
  const filePath = options.outputPath || path.join(process.cwd(), fileName);
  const writeStream = fs.createWriteStream(filePath);

  doc.pipe(writeStream);

  // Header Banner
  doc.rect(40, 40, 515, 60).fill('#1E293B');
  doc.fillColor('#FFFFFF').fontSize(20).text('INVOICE / PAYMENT RECEIPT', 60, 58);
  doc.fontSize(10).text(options.payeeName, 420, 55, { align: 'right' });
  doc.text(`UPI: ${options.payeeVpa}`, 420, 70, { align: 'right' });

  // Invoice Details & Bill To
  doc.fillColor('#000000').fontSize(10);
  doc.text(`Invoice Number: ${options.invoiceNumber}`, 40, 120);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 40, 135);

  doc.text(`Billed To: ${options.customerName}`, 320, 120);
  if (options.customerEmail) doc.text(`Email: ${options.customerEmail}`, 320, 135);

  // Line Item Table Header
  const tableTop = 170;
  doc.rect(40, tableTop, 515, 20).fill('#F1F5F9');
  doc.fillColor('#334155').font('Helvetica-Bold');
  doc.text('Description', 50, tableTop + 5);
  doc.text('Qty', 320, tableTop + 5);
  doc.text('Unit Price', 380, tableTop + 5);
  doc.text('Total', 480, tableTop + 5);

  // Items
  let y = tableTop + 30;
  let subtotal = 0;
  doc.font('Helvetica').fillColor('#0F172A');

  for (const item of options.items) {
    const itemTotal = item.quantity * item.price;
    subtotal += itemTotal;

    doc.text(item.name, 50, y);
    doc.text(item.quantity.toString(), 320, y);
    doc.text(`₹${item.price.toFixed(2)}`, 380, y);
    doc.text(`₹${itemTotal.toFixed(2)}`, 480, y);
    y += 20;
  }

  // Summary
  doc.moveTo(40, y + 5).lineTo(555, y + 5).stroke('#E2E8F0');
  doc.font('Helvetica-Bold').fontSize(12);
  doc.text(`Total Due: ₹${subtotal.toFixed(2)}`, 380, y + 15);

  // Scannable QR Code
  const qrBuffer = await QRCode.toBuffer(options.upiUri, { width: 140, margin: 1 });
  doc.image(qrBuffer, 225, y + 60, { width: 140 });

  doc.fontSize(9).font('Helvetica').fillColor('#64748B');
  doc.text('Scan with GPay, PhonePe, Paytm, or CRED to complete payment', 40, y + 210, {
    align: 'center',
    width: 515,
  });

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
}