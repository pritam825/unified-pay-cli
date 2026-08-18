import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { CreatePaymentLinkOptions } from '../types/interface/CreatePaymentLinkOptions.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { Transaction } from '../types/interface/Transaction.js';
import { RefundOptions } from '../types/interface/RefundOptions.js';
import { RefundResult } from '../types/interface/RefundResult.js';
import { RefundDetails } from '../types/interface/RefundDetails.js';

export class LemonSqueezyAdapter implements PaymentProvider {
  name = 'lemonsqueezy';
  private apiKey: string;
  private storeId: string;

  constructor(apiKey: string, storeId: string) {
    this.apiKey = apiKey;
    this.storeId = storeId;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const res = await fetch(`https://api.lemonsqueezy.com/v1${endpoint}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.errors?.[0]?.detail || `LemonSqueezy API error: ${res.statusText}`);
    }
    return res.json();
  }

  async createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: options.amount,
          product_options: {
            name: options.description,
            description: options.description,
          },
          checkout_data: {
            email: options.customerEmail || undefined,
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: this.storeId,
            },
          },
        },
      },
    };

    const res = await this.request('/checkouts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const checkout = res.data;
    return {
      id: checkout.id,
      url: checkout.attributes.url,
      amount: options.amount,
      currency: options.currency.toUpperCase(),
      status: 'active',
      rawResponse: checkout,
    };
  }

  async listTransactions(limit = 10): Promise<Transaction[]> {
    const res = await this.request(`/orders?page[size]=${limit}`);
    return (res.data || []).map((order: any) => ({
      id: order.id,
      amount: order.attributes.total,
      currency: order.attributes.currency,
      status: order.attributes.status,
      createdAt: order.attributes.created_at,
      description: order.attributes.first_order_item?.product_name || undefined,
    }));
  }

  async getPaymentStatus(paymentId: string): Promise<Transaction> {
    const res = await this.request(`/orders/${paymentId}`);
    const order = res.data;
    return {
      id: order.id,
      amount: order.attributes.total,
      currency: order.attributes.currency,
      status: order.attributes.status,
      createdAt: order.attributes.created_at,
      description: order.attributes.first_order_item?.product_name || undefined,
    };
  }

  async createRefund(options: RefundOptions): Promise<RefundResult> {
    // LemonSqueezy requires creating refund records via orders or subscriptions
    throw new Error('Direct automated refunds for LemonSqueezy are managed via the LemonSqueezy Merchant portal.');
  }

  async getRefundStatus(refundId: string): Promise<RefundDetails> {
    throw new Error('Refund inspection not supported on LemonSqueezy endpoint.');
  }

  async listRefunds(limit?: number): Promise<RefundDetails[]> {
    return [];
  }
}