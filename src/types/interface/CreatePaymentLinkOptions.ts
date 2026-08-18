export interface CreatePaymentLinkOptions {
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
}