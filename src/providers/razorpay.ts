import Razorpay from 'razorpay';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { CreatePaymentLinkOptions } from '../types/interface/CreatePaymentLinkOptions.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { Transaction } from '../types/interface/Transaction.js';
import { RefundOptions } from '../types/interface/RefundOptions.js';
import { RefundResult } from '../types/interface/RefundResult.js';


export class RazorpayAdapter implements PaymentProvider {
  name = 'razorpay';
  private client: any;

  constructor(keyId: string, keySecret: string) {
    this.client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
    const payload: Record<string, any> = {
      amount: options.amount,
      currency: options.currency.toUpperCase(),
      description: options.description,
    };

    if (options.customerEmail) {
      payload.customer = { email: options.customerEmail };
    }

    const link = await this.client.paymentLink.create(payload);

    return {
      id: link.id,
      url: link.short_url,
      amount: link.amount,
      currency: link.currency,
      status: link.status,
      rawResponse: link,
    };
  }

  async listTransactions(limit = 10): Promise<Transaction[]> {
    const payments = await this.client.payments.all({ count: limit });
    return (payments.items || []).map((p: any) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      createdAt: new Date(p.created_at * 1000).toISOString(),
      description: p.description || undefined,
    }));
  }

  async getPaymentStatus(paymentId: string): Promise<Transaction> {
    const p = await this.client.payments.fetch(paymentId);
    return {
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      createdAt: new Date(p.created_at * 1000).toISOString(),
      description: p.description || undefined,
    };
  }

  async createRefund(options: RefundOptions): Promise<RefundResult> {
    const payload: Record<string, any> = {};
    if (options.amount) payload.amount = options.amount;

    const refund = await this.client.payments.refund(options.paymentId, payload);

    return {
      id: refund.id,
      paymentId: options.paymentId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status || 'processed',
    };
  }
}