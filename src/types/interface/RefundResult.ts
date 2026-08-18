export interface RefundResult {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
}