import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerEmail?: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  upiUri: string;
  currency?: string;
}

export async function generateInvoicePdf(data: InvoiceData, outputPath: string): Promise<string> {
  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  // Header
  doc.fontSize(20).text('TAX INVOICE / PAYMENT RECEIPT', { align: 'center' }).moveDown();
  doc.fontSize(10).text(`Invoice #: ${data.invoiceNumber}`);
  doc.text(`Date: ${data.date}`);
  doc.text(`Billed To: ${data.customerName} ${data.customerEmail ? `(${data.customerEmail})` : ''}`).moveDown();

  // Table header
  doc.fontSize(11).font('Helvetica-Bold');
  doc.text('Item Description', 50, 160);
  doc.text('Qty', 300, 160);
  doc.text('Price', 380, 160);
  doc.text('Total', 480, 160);
  doc.moveTo(50, 175).lineTo(550, 175).stroke();

  // Rows
  doc.font('Helvetica');
  let y = 185;
  let grandTotal = 0;
  for (const item of data.items) {
    const itemTotal = item.quantity * item.unitPrice;
    grandTotal += itemTotal;
    doc.text(item.name, 50, y);
    doc.text(item.quantity.toString(), 300, y);
    doc.text(`₹${item.unitPrice.toFixed(2)}`, 380, y);
    doc.text(`₹${itemTotal.toFixed(2)}`, 480, y);
    y += 20;
  }

  doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke();
  doc.font('Helvetica-Bold').text(`Grand Total: ₹${grandTotal.toFixed(2)}`, 400, y + 15).moveDown(3);

  // Embed Scannable UPI QR Image
  const qrBuffer = await QRCode.toBuffer(data.upiUri, { width: 150, margin: 1 });
  doc.image(qrBuffer, 225, y + 50, { width: 150 });
  doc.fontSize(9).font('Helvetica').text('Scan with GPay / PhonePe / Paytm to Pay', 50, y + 210, { align: 'center' });

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
  });
}