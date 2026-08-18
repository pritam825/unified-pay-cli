import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { LemonSqueezyAdapter } from '../providers/lemonsqueezy.js';
import { WebhookVerifier } from '../crypto/WebhookVerifier.js';
import { GatewayRouter } from '../utils/router.js';
import { WebhookTrigger } from '../utils/trigger.js';
import { ProfileManager } from '../utils/profiles.js';
import { PaymentProviderType } from '../types/PaymentProviderType.js';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';

const server = new Server(
  {
    name: 'unified-pay',
    version: '0.3.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const profileManager = new ProfileManager();

function getActiveProvider(providerName: PaymentProviderType): PaymentProvider {
  const activeProfile = profileManager.getProfile();

  if (providerName === 'stripe') {
    const key = activeProfile.stripeApiKey || process.env.STRIPE_API_KEY;
    if (!key) throw new Error('Stripe API key is not configured.');
    return new StripeAdapter(key);
  }

  if (providerName === 'razorpay') {
    const keyId = activeProfile.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = activeProfile.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay credentials are not configured.');
    return new RazorpayAdapter(keyId, keySecret);
  }

  if (providerName === 'lemonsqueezy') {
    const key = activeProfile.lemonApiKey || process.env.LEMONSQUEEZY_API_KEY;
    const storeId = activeProfile.lemonStoreId || process.env.LEMONSQUEEZY_STORE_ID;
    if (!key || !storeId) throw new Error('LemonSqueezy credentials are not configured.');
    return new LemonSqueezyAdapter(key, storeId);
  }

  throw new Error(`Unsupported provider: ${providerName}`);
}

// -------------------------------------------------------------------
// 1. Declare All AI Tools (ListTools)
// -------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_payment_link',
        description: 'Generate a payment/checkout link with custom amount, currency, description, expiry timeout, and prefilled customer details (name, email, phone).',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount in minor units (e.g. 50000 = ₹500)' },
            currency: { type: 'string', description: 'Currency code (INR, USD, etc.)' },
            description: { type: 'string', description: 'Payment description' },
            customerName: { type: 'string', description: 'Customer full name to prefill' },
            customerPhone: { type: 'string', description: 'Customer phone number (e.g. +919876543210)' },
            customerEmail: { type: 'string', description: 'Customer email address' },
            expiresInMinutes: { type: 'number', description: 'Expiry timeout in minutes' },
            provider: { type: 'string', enum: ['stripe', 'razorpay', 'lemonsqueezy'] },
            smartRouting: { type: 'boolean' }
          },
          required: ['amount', 'currency', 'description']
        }
      },
      {
        name: 'compare_gateway_fees',
        description: 'Compare transaction processing fees, deductions, and net payouts across Razorpay, Stripe, and LemonSqueezy for an amount and currency.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount in minor units (e.g. 50000)' },
            currency: { type: 'string', description: 'Currency code (INR, USD, EUR)' },
          },
          required: ['amount', 'currency'],
        },
      },
      {
        name: 'trigger_mock_webhook',
        description: 'Simulate and send an authentic HMAC-SHA256 signed webhook event (e.g. payment.captured, payment.failed) to a local or remote endpoint for testing.',
        inputSchema: {
          type: 'object',
          properties: {
            event: { type: 'string', description: 'Event name (e.g. payment.captured, payment.failed, refund.processed)' },
            provider: { type: 'string', enum: ['razorpay', 'stripe'] },
            targetUrl: { type: 'string', description: 'Backend HTTP endpoint (e.g. http://localhost:3000/api/webhooks)' },
            secret: { type: 'string', description: 'Webhook signing secret' },
            amount: { type: 'number', description: 'Amount in minor units' },
          },
          required: ['event', 'provider', 'targetUrl'],
        },
      },
      {
        name: 'verify_webhook_signature',
        description: 'Verify the cryptographic HMAC-SHA256 authenticity of an incoming Stripe or Razorpay webhook payload.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['razorpay', 'stripe'] },
            rawPayload: { type: 'string', description: 'Exact raw body of the HTTP request' },
            signature: { type: 'string', description: 'x-razorpay-signature or stripe-signature header' },
            secret: { type: 'string', description: 'Webhook signing secret' },
          },
          required: ['provider', 'rawPayload', 'signature', 'secret'],
        },
      },
      {
        name: 'get_payment_analytics',
        description: 'Retrieve real-time transaction performance, captured revenue, and success rates across gateways.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['stripe', 'razorpay', 'lemonsqueezy'] },
            limit: { type: 'number', description: 'Number of recent charges to analyze' },
          },
          required: ['provider'],
        },
      },
      {
        name: 'create_itemized_invoice',
        description: 'Generate an itemized checkout link with multiple line items, customer email, and tax breakdown.',
        inputSchema: {
          type: 'object',
          properties: {
            customerEmail: { type: 'string', description: 'Customer email' },
            currency: { type: 'string', description: 'Currency code' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'number' },
                  unitAmount: { type: 'number', description: 'Price per unit in minor units' },
                },
                required: ['name', 'quantity', 'unitAmount'],
              },
            },
            provider: { type: 'string', enum: ['stripe', 'razorpay', 'lemonsqueezy'] },
          },
          required: ['customerEmail', 'items'],
        },
      },
      {
        name: 'create_refund',
        description: 'Issue a partial or full refund for a payment ID.',
        inputSchema: {
          type: 'object',
          properties: {
            paymentId: { type: 'string', description: 'Charge or Payment ID (e.g. pay_xxx, ch_xxx)' },
            amount: { type: 'number', description: 'Amount in minor units (optional for full refund)' },
            provider: { type: 'string', enum: ['stripe', 'razorpay'] },
          },
          required: ['paymentId', 'provider'],
        },
      },
    ],
  };
});

// -------------------------------------------------------------------
// 2. Tool Execution Handlers (CallTool)
// -------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 1. Payment Link Creation with Expiry & Smart Routing
    if (name === 'create_payment_link') {
      let provider = args?.provider as PaymentProviderType;
      if (args?.smartRouting || !provider) {
        provider = GatewayRouter.recommendProvider(args?.currency as string, args?.amount as number);
      }
      const client = getActiveProvider(provider);
      const res = await client.createPaymentLink({
        amount: args?.amount as number,
        currency: args?.currency as string,
        description: args?.description as string,
        expiresInMinutes: args?.expiresInMinutes as number | undefined,
        customerEmail: args?.customerEmail as string | undefined,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...res, chosenProvider: provider }, null, 2) }],
      };
    }

    // 2. Gateway Fee Comparison
    if (name === 'compare_gateway_fees') {
      const estimates = GatewayRouter.compareFees(args?.amount as number, args?.currency as string);
      return {
        content: [{ type: 'text', text: JSON.stringify(estimates, null, 2) }],
      };
    }

    // 3. Mock Webhook Trigger
    if (name === 'trigger_mock_webhook') {
      const res = await WebhookTrigger.sendMockEvent(
        args?.targetUrl as string,
        args?.event as string,
        args?.provider as PaymentProviderType,
        args?.secret as string | undefined,
        args?.amount as number | undefined
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }

    // 4. Webhook Signature Verification
    if (name === 'verify_webhook_signature') {
      let isValid = false;
      if (args?.provider === 'razorpay') {
        isValid = WebhookVerifier.verifyRazorpaySignature(args.rawPayload as string, args.signature as string, args.secret as string);
      } else if (args?.provider === 'stripe') {
        isValid = WebhookVerifier.verifyStripeSignature(args.rawPayload as string, args.signature as string, args.secret as string);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ verified: isValid }, null, 2) }],
      };
    }

    // 5. Payment Analytics
    if (name === 'get_payment_analytics') {
      const client = getActiveProvider(args?.provider as PaymentProviderType);
      const txns = await client.listTransactions(args?.limit as number || 50);
      const totalVolume = txns.reduce((acc, t) => acc + t.amount, 0);
      const successful = txns.filter((t) => ['captured', 'paid', 'succeeded'].includes(t.status.toLowerCase()));
      const successVolume = successful.reduce((acc, t) => acc + t.amount, 0);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            provider: args?.provider,
            totalChargesCount: txns.length,
            totalVolume,
            capturedVolume: successVolume,
            conversionRate: `${((successful.length / (txns.length || 1)) * 100).toFixed(1)}%`,
          }, null, 2),
        }],
      };
    }

    // 6. Itemized Invoice
    if (name === 'create_itemized_invoice') {
      const items = args?.items as Array<{ name: string; quantity: number; unitAmount: number }>;
      const total = items.reduce((acc, i) => acc + (i.quantity * i.unitAmount), 0);
      const desc = items.map((i) => `${i.name} (x${i.quantity})`).join(', ');
      const provider = (args?.provider as PaymentProviderType) || GatewayRouter.recommendProvider(args?.currency as string || 'INR', total);
      const client = getActiveProvider(provider);
      const res = await client.createPaymentLink({
        amount: total,
        currency: (args?.currency as string) || 'INR',
        description: `Invoice: ${desc}`,
        customerEmail: args?.customerEmail as string,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...res, itemizedBreakdown: items }, null, 2) }],
      };
    }

    // 7. Refunds
    if (name === 'create_refund') {
      const client = getActiveProvider(args?.provider as PaymentProviderType);
      const res = await client.createRefund({
        paymentId: args?.paymentId as string,
        amount: args?.amount as number | undefined,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }

    throw new Error(`Tool ${name} not found`);
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${error.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);