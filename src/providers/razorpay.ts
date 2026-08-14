import Razorpay from 'razorpay';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { CreatePaymentLinkOptions } from '../types/interface/CreatePaymentLinkOptions.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { Transaction } from '../types/interface/Transaction.js';

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
    // 1. Build request payload
    const payload: Record<string, any> = {
      amount: options.amount,
      currency: options.currency.toUpperCase(),
      description: options.description,
    };

    // 2. Only attach customer object if email is provided
    if (options.customerEmail) {
      payload.customer = {
        email: options.customerEmail,
      };
    }

    // 3. Create payment link
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

  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    return true;
  }

  async listTransactions(limit = 10): Promise<Transaction[]> {
  const payments = await this.client.payments.all({ count: limit });
  return payments.items.map((p: any) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: new Date(p.created_at * 1000).toISOString(),
  }));
}   
}