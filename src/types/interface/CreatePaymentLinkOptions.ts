export interface CreatePaymentLinkOptions {
  amount: number;       // In smallest currency unit (e.g., cents or paise)
  currency: string;     // e.g., 'USD', 'INR'
  description: string;
  customerEmail?: string;
}