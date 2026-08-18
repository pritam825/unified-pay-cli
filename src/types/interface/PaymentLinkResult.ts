export interface PaymentLinkResult {
  id: string;
  url: string;
  amount: number;
  currency: string;
  status: string;
  expiresAt?: string;
  rawResponse?: any;
}