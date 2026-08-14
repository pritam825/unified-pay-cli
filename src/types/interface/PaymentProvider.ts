import { CreatePaymentLinkOptions } from "./CreatePaymentLinkOptions.js";
import { PaymentLinkResult } from "./PaymentLinkResult.js";
import { Transaction } from "./Transaction.js";

export interface PaymentProvider {
  name: string;
  createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult>;
  listTransactions(limit?: number): Promise<Transaction[]>;
  verifyWebhook?(payload: string, signature: string): Promise<boolean>;
}