import { CreatePaymentLinkOptions } from "./CreatePaymentLinkOptions.js";
import { PaymentLinkResult } from "./PaymentLinkResult.js";
import { RefundOptions } from "./RefundOptions.js";
import { RefundResult } from "./RefundResult.js";
import { Transaction } from "./Transaction.js";

export interface PaymentProvider {
  name: string;
  createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult>;
  listTransactions(limit?: number): Promise<Transaction[]>;
  getPaymentStatus(paymentId: string): Promise<Transaction>;
  createRefund(options: RefundOptions): Promise<RefundResult>;
}