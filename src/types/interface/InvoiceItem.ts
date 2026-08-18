export interface InvoiceItem {
  name: string;
  quantity: number;
  unitAmount: number; // in minor units (e.g. cents/paise)
}