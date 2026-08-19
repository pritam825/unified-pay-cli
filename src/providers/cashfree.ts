import axios from 'axios';
    
import { PaymentProviderType } from '../types/PaymentProviderType.js';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { RefundOptions } from '../types/interface/RefundOptions.js';

export class CashfreeAdapter implements PaymentProvider {
  readonly name: PaymentProviderType = 'cashfree';
  private appId: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(appId: string, secretKey: string, isProduction: boolean = false) {
    this.appId = appId;
    this.secretKey = secretKey;
    this.baseUrl = isProduction
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  private getHeaders() {
    return {
      'x-client-id': this.appId,
      'x-client-secret': this.secretKey,
      'x-api-version': '2023-08-01',
      'Content-Type': 'application/json',
    };
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
    const linkId = `link_${Date.now()}`;
    const amountInINR = options.amount / 100;

    const payload: any = {
      link_id: linkId,
      link_amount: amountInINR,
      link_currency: options.currency || 'INR',
      link_purpose: options.description || 'Payment',
      customer_details: {
        customer_phone: options.customerPhone || '9999999999',
        customer_email: options.customerEmail || 'customer@example.com',
        customer_name: options.customerName || 'Customer',
      },
      link_notify: {
        send_sms: Boolean(options.customerPhone),
        send_email: Boolean(options.customerEmail),
      },
    };

    if (options.expiresInMinutes) {
      payload.link_expiry_time = new Date(Date.now() + options.expiresInMinutes * 60000).toISOString();
    }

    const response = await axios.post(`${this.baseUrl}/links`, payload, {
      headers: this.getHeaders(),
    });

    return {
      id: response.data.link_id,
      url: response.data.link_url,
      status: (response.data.link_status || 'ACTIVE').toLowerCase(),
      amount: options.amount,
      currency: options.currency || 'INR',
      qrCodeData: response.data.link_url,
    } as PaymentLinkResult;
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/links/${paymentId}`, {
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async createRefund(options: RefundOptions): Promise<any> {
    const refundId = `ref_${Date.now()}`;
    const payload: any = {
      refund_id: refundId,
    };

    if (options.amount) {
      payload.refund_amount = options.amount / 100;
    }

    const response = await axios.post(
      `${this.baseUrl}/orders/${options.paymentId}/refunds`,
      payload,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getRefundStatus(refundId: string): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/refunds/${refundId}`, {
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async listRefunds(): Promise<any[]> {
    return [];
  }

  async listTransactions(): Promise<any[]> {
    return [];
  }
}