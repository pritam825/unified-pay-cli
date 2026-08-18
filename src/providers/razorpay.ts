import Razorpay from 'razorpay';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { CreatePaymentLinkOptions } from '../types/interface/CreatePaymentLinkOptions.js';
import { PaymentLinkResult } from '../types/interface/PaymentLinkResult.js';
import { Transaction } from '../types/interface/Transaction.js';
import { RefundOptions } from '../types/interface/RefundOptions.js';
import { RefundResult } from '../types/interface/RefundResult.js';
import { RefundDetails } from '../types/interface/RefundDetails.js';


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
        const payload: any = {
            amount: options.amount,
            currency: options.currency.toUpperCase(),
            description: options.description,
        };

        // Prefill customer details if provided
        if (options.customerEmail || options.customerName || options.customerPhone) {
            payload.customer = {
                name: options.customerName || undefined,
                email: options.customerEmail || undefined,
                contact: options.customerPhone || undefined,
            };

            // Auto-trigger SMS/Email notification if contact/email exists
            payload.notify = {
                sms: Boolean(options.customerPhone),
                email: Boolean(options.customerEmail),
            };
        }

        if (options.expiresInMinutes && options.expiresInMinutes > 0) {
            payload.expire_by = Math.floor(Date.now() / 1000) + (options.expiresInMinutes * 60) + 60;
        }

        const res = await this.client.paymentLink.create(payload);

        return {
            id: res.id,
            url: res.short_url,
            amount: res.amount,
            currency: res.currency,
            status: res.status,
            expiresAt: res.expire_by ? new Date(res.expire_by * 1000).toISOString() : undefined,
            rawResponse: res,
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

    async getRefundStatus(refundId: string): Promise<RefundDetails> {
        const r = await this.client.refunds.fetch(refundId);
        return {
            id: r.id,
            paymentId: r.payment_id,
            amount: r.amount,
            currency: r.currency,
            status: r.status,
            createdAt: new Date(r.created_at * 1000).toISOString(),
            speedProcessed: r.speed_processed || 'normal',
        };
    }

    async listRefunds(limit = 10): Promise<RefundDetails[]> {
        const refunds = await this.client.refunds.all({ count: limit });
        return (refunds.items || []).map((r: any) => ({
            id: r.id,
            paymentId: r.payment_id,
            amount: r.amount,
            currency: r.currency,
            status: r.status,
            createdAt: new Date(r.created_at * 1000).toISOString(),
            speedProcessed: r.speed_processed || 'normal',
        }));
    }
}