import { InvoiceItem } from "./InvoiceItem.js";

export interface CreateInvoiceOptions {
  customerEmail: string;
  customerName?: string;
  currency: string;
  items: InvoiceItem[];
  taxPercentage?: number;
  description?: string;
  expiresInMinutes?: number;
}