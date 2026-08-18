import crypto from 'crypto';

export class WebhookVerifier {
  /**
   * Verifies Razorpay Webhook Signatures
   */
  static verifyRazorpaySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const signatureBuf = Buffer.from(signature, 'utf8');

      // Guard: Lengths must match before calling timingSafeEqual
      if (expectedBuf.length !== signatureBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }

  /**
   * Verifies Stripe Webhook Signatures
   */
  static verifyStripeSignature(rawBody: string, header: string, secret: string): boolean {
    if (!header || !secret) return false;
    try {
      const parts = header.split(',').reduce((acc: Record<string, string>, item) => {
        const [k, v] = item.split('=');
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {});

      const timestamp = parts['t'];
      const signature = parts['v1'];
      if (!timestamp || !signature) return false;

      const signedPayload = `${timestamp}.${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const signatureBuf = Buffer.from(signature, 'utf8');

      // Guard: Lengths must match before calling timingSafeEqual
      if (expectedBuf.length !== signatureBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }
}