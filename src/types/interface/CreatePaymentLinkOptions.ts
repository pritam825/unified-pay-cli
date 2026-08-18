export interface CreatePaymentLinkOptions {
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  expiresInMinutes?: number; // ⏳ Link expiry in minutes (e.g. 5, 15, 60)
}