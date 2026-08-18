import chalk from 'chalk';
import { PaymentProviderType } from '../types/PaymentProviderType.js';
export interface FeeEstimate {
  provider: PaymentProviderType;
  percentageFee: number;
  fixedFee: number; // minor units
  estimatedDeduction: number; // minor units
  netPayout: number; // minor units
  recommended: boolean;
  reason: string;
}

export class GatewayRouter {
  /**
   * Recommends the optimal gateway based on currency, geography, and transaction fees
   */
  static recommendProvider(currency: string, amount: number): PaymentProviderType {
    const cur = currency.toUpperCase();
    if (cur === 'INR') return 'razorpay'; // Best UPI/Cards support in India
    if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(cur)) return 'stripe'; // Best global card conversion
    return 'lemonsqueezy'; // Best for global tax & merchant-of-record
  }

  /**
   * Compares gateway fee breakdowns for a transaction
   */
  static compareFees(amount: number, currency: string): FeeEstimate[] {
    const cur = currency.toUpperCase();
    
    // Fee Structures (Standard card rates)
    // Razorpay: 2% + ₹0
    // Stripe: 2.9% + $0.30 (30 cents = 30 minor units)
    // LemonSqueezy: 5% + $0.50 (MoR includes global tax filing)

    const rzpPercent = 0.02;
    const rzpFixed = 0;
    const rzpDeduction = Math.round(amount * rzpPercent) + rzpFixed;

    const stripePercent = 0.029;
    const stripeFixed = cur === 'INR' ? 300 : 30; // ₹3 or $0.30
    const stripeDeduction = Math.round(amount * stripePercent) + stripeFixed;

    const lemonPercent = 0.05;
    const lemonFixed = cur === 'INR' ? 500 : 50; // ₹5 or $0.50
    const lemonDeduction = Math.round(amount * lemonPercent) + lemonFixed;

    return [
      {
        provider: 'razorpay',
        percentageFee: 2.0,
        fixedFee: rzpFixed,
        estimatedDeduction: rzpDeduction,
        netPayout: amount - rzpDeduction,
        recommended: cur === 'INR',
        reason: cur === 'INR' ? 'Lowest transaction fees & Native UPI rail' : 'Higher international conversion spread',
      },
      {
        provider: 'stripe',
        percentageFee: 2.9,
        fixedFee: stripeFixed,
        estimatedDeduction: stripeDeduction,
        netPayout: amount - stripeDeduction,
        recommended: cur !== 'INR',
        reason: cur !== 'INR' ? 'Lowest cross-border dispute & FX fees' : 'Higher domestic processing rate',
      },
      {
        provider: 'lemonsqueezy',
        percentageFee: 5.0,
        fixedFee: lemonFixed,
        estimatedDeduction: lemonDeduction,
        netPayout: amount - lemonDeduction,
        recommended: false,
        reason: 'Merchant of Record handles global EU VAT/sales tax compliance',
      },
    ];
  }
}