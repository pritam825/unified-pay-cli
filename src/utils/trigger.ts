import crypto from 'crypto';
import chalk from 'chalk';
import { PaymentProviderType } from '../types/PaymentProviderType.js';
export class WebhookTrigger {
  static generateMockPayload(event: string, provider: PaymentProviderType, amount = 50000) {
    const timestamp = Math.floor(Date.now() / 1000);
    const id = `mock_${Math.random().toString(36).substring(2, 9)}`;

    if (provider === 'razorpay') {
      return {
        entity: 'event',
        account_id: 'acc_test123',
        event: event,
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: `pay_${id}`,
              amount: amount,
              currency: 'INR',
              status: event.includes('captured') ? 'captured' : event.includes('failed') ? 'failed' : 'refunded',
              method: 'upi',
              created_at: timestamp,
            },
          },
        },
        created_at: timestamp,
      };
    }

    // Default: Stripe mock
    return {
      id: `evt_${id}`,
      object: 'event',
      type: event,
      created: timestamp,
      data: {
        object: {
          id: `ch_${id}`,
          amount: amount,
          currency: 'usd',
          status: event.includes('succeeded') ? 'succeeded' : 'failed',
        },
      },
    };
  }

  static async sendMockEvent(
    targetUrl: string,
    event: string,
    provider: PaymentProviderType,
    secret?: string,
    amount = 50000
  ) {
    const payloadObj = this.generateMockPayload(event, provider, amount);
    const rawBody = JSON.stringify(payloadObj);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'unified-pay-cli/webhook-trigger',
    };

    if (secret) {
      if (provider === 'razorpay') {
        const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        headers['x-razorpay-signature'] = sig;
      } else if (provider === 'stripe') {
        const timestamp = Math.floor(Date.now() / 1000);
        const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        headers['stripe-signature'] = `t=${timestamp},v1=${sig}`;
      }
    }

    console.log(chalk.cyan(`\n🚀 Firing synthetic [${chalk.bold(event)}] event to ${targetUrl}...`));

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: rawBody,
    });

    return {
      status: response.status,
      statusText: response.statusText,
      payload: payloadObj,
      headersSent: headers,
    };
  }
}