import Stripe from 'stripe';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { CreatePaymentLinkOptions } from '../types/interface/CreatePaymentLinkOptions.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { Transaction } from '../types/interface/Transaction.js';
export class StripeAdapter implements PaymentProvider {
  name = 'stripe';
  private client: Stripe;

  constructor(apiKey: string) {
    this.client = new Stripe(apiKey);
  }

  async createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
    // 1. Create a price object
    const price = await this.client.prices.create({
      currency: options.currency.toLowerCase(),
      unit_amount: options.amount,
      product_data: { name: options.description },
    });

    // 2. Generate the payment link
    const link = await this.client.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
    });

    return {
      id: link.id,
      url: link.url,
      amount: options.amount,
      currency: options.currency,
      status: link.active ? 'active' : 'inactive',
      rawResponse: link,
    };
  }

  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    // Webhook verification logic...
    return true;
  }

  async listTransactions(limit = 10): Promise<Transaction[]> {
  const charges = await this.client.charges.list({ limit });
  return charges.data.map(c => ({
    id: c.id,
    amount: c.amount,
    currency: c.currency.toUpperCase(),
    status: c.status,
    createdAt: new Date(c.created * 1000).toISOString(),
  }));
}
}