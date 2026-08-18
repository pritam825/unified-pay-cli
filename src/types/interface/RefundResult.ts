export interface RefundResult {
  id: string;
  paymentId: string;
  amount: number;
  currency?: string; // 👈 Added
  status: string;
  rawResponse?: any;
}