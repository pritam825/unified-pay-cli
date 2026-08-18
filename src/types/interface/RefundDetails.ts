export interface RefundDetails {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  speedProcessed?: string;
}