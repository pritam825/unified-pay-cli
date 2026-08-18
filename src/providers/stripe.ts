import Stripe from 'stripe';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { CreatePaymentLinkOptions } from '../types/interface/CreatePaymentLinkOptions.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { Transaction } from '../types/interface/Transaction.js';
import { RefundOptions } from '../types/interface/RefundOptions.js';
import { RefundResult } from '../types/interface/RefundResult.js';
import { RefundDetails } from '../types/interface/RefundDetails.js';


export class StripeAdapter implements PaymentProvider {
    name = 'stripe';
    private client: Stripe;

    constructor(apiKey: string) {
        this.client = new Stripe(apiKey, {
            apiVersion: '2023-10-16' as any,
        });
    }

    async createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult> {
        const price = await this.client.prices.create({
            currency: options.currency.toLowerCase(),
            unit_amount: options.amount,
            product_data: {
                name: options.description,
            },
        });

        const paymentLink = await this.client.paymentLinks.create({
            line_items: [{ price: price.id, quantity: 1 }],
        });

        return {
            id: paymentLink.id,
            url: paymentLink.url,
            amount: options.amount,
            currency: options.currency.toUpperCase(),
            status: paymentLink.active ? 'active' : 'inactive',
            rawResponse: paymentLink,
        };
    }

    async listTransactions(limit = 10): Promise<Transaction[]> {
        const charges = await this.client.charges.list({ limit });
        return charges.data.map((c: any) => ({
            id: c.id,
            amount: c.amount,
            currency: c.currency.toUpperCase(),
            status: c.status,
            createdAt: new Date(c.created * 1000).toISOString(),
            description: c.description || undefined,
        }));
    }

    async getPaymentStatus(paymentId: string): Promise<Transaction> {
        const charge = await this.client.charges.retrieve(paymentId);
        return {
            id: charge.id,
            amount: charge.amount,
            currency: charge.currency.toUpperCase(),
            status: charge.status,
            createdAt: new Date(charge.created * 1000).toISOString(),
            description: charge.description || undefined,
        };
    }

    async createRefund(options: RefundOptions): Promise<RefundResult> {
        const refund = await this.client.refunds.create({
            charge: options.paymentId,
            amount: options.amount,
        });

        return {
            id: refund.id,
            paymentId: options.paymentId,
            amount: refund.amount,
            currency: refund.currency.toUpperCase(),
            status: refund.status || 'succeeded',
        };
    }

    async getRefundStatus(refundId: string): Promise<RefundDetails> {
        const r = await this.client.refunds.retrieve(refundId);
        return {
            id: r.id,
            paymentId: typeof r.charge === 'string' ? r.charge : (r.charge?.id || ''),
            amount: r.amount,
            currency: r.currency.toUpperCase(),
            status: r.status || 'succeeded',
            createdAt: new Date(r.created * 1000).toISOString(),
        };
    }
    
    async listRefunds(limit = 10): Promise<RefundDetails[]> {
        const refunds = await this.client.refunds.list({ limit });
        return refunds.data.map((r: any) => ({
            id: r.id,
            paymentId: typeof r.charge === 'string' ? r.charge : (r.charge?.id || ''),
            amount: r.amount,
            currency: r.currency.toUpperCase(),
            status: r.status || 'succeeded',
            createdAt: new Date(r.created * 1000).toISOString(),
        }));
    }
}