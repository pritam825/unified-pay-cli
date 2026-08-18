export interface RefundOptions {
  paymentId: string;
  amount?: number;
  notes?: Record<string, string>;
}