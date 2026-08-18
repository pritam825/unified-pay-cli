export interface RefundOptions {
  paymentId: string;
  amount?: number; // Minor units (optional for full refund)
  notes?: Record<string, string>;
}