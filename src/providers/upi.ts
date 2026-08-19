import QRCode from 'qrcode';

import { PaymentProviderType } from '../types/PaymentProviderType.js';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { RefundOptions } from '../types/interface/RefundOptions.js';

export class UPIAdapter implements PaymentProvider {
  readonly name: PaymentProviderType = 'upi';
  private vpa: string;
  private payeeName: string;

  constructor(vpa: string, payeeName?: string) {
    this.vpa = vpa.trim().toLowerCase();
    this.payeeName = payeeName?.trim() || 'Merchant';
  }

  async createPaymentLink(options: {
    amount: number;
    currency?: string;
    description?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    expiresInMinutes?: number;
  }): Promise<PaymentLinkResult> {
    // Inside createPaymentLink():
const amountInINR = (options.amount / 100).toFixed(2);
const txnId = `TXN${Date.now()}`;
const cleanDescription = (options.description || 'Payment').replace(/[^a-zA-Z0-9 ]/g, '');

// Clean NPCI URI
const upiUri = `upi://pay?pa=${encodeURIComponent(this.vpa)}&pn=${encodeURIComponent(
  this.payeeName
)}&am=${amountInINR}&cu=INR&tn=${encodeURIComponent(cleanDescription)}&tr=${txnId}`;

// Direct scannable QR image link
const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUri)}`;

return {
  id: txnId,
  url: upiUri,
  status: 'active',
  amount: options.amount,
  currency: 'INR',
  qrCodeData: upiUri,
  qrImageUrl: qrImageUrl,       // Clean, valid QR image
  qrCodeAscii: await QRCode.toString(upiUri, { type: 'terminal', small: true }), // Terminal ASCII QR
};
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    return {
      id: paymentId,
      status: 'unknown',
      message: 'Status tracking is not available for direct P2P UPI transfers.',
    };
  }

  async createRefund(_options: RefundOptions): Promise<any> {
    throw new Error(
      'Direct P2P UPI transfers cannot trigger automated programmatic refunds. The payee must refund the sender directly via their UPI app.'
    );
  }

  async getRefundStatus(refundId: string): Promise<any> {
    return { id: refundId, status: 'unknown' };
  }

  async listRefunds(): Promise<any[]> {
    return [];
  }

  async listTransactions(): Promise<any[]> {
    return [];
  }
}