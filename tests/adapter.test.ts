import { describe, it, expect } from 'vitest';
import { RazorpayAdapter } from '../src/providers/razorpay.js';
import { StripeAdapter } from '../src/providers/stripe.js';

describe('Provider Initialization', () => {
  it('initializes Razorpay adapter correctly', () => {
    const adapter = new RazorpayAdapter('rzp_test_123', 'secret_123');
    expect(adapter.name).toBe('razorpay');
  });

  it('initializes Stripe adapter correctly', () => {
    const adapter = new StripeAdapter('sk_test_123');
    expect(adapter.name).toBe('stripe');
  });
});