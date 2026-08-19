export interface PaymentLinkResult {
  id: string;
  url: string;
  status: string;
  amount: number;
  currency: string;
  qrCodeData?: string;       // Raw upi:// or checkout URL
  qrCodeAscii?: string;      // Terminal ASCII QR code
  qrImageDataUrl?: string;   // base64 image/png data URL
  [key: string]: any;
}