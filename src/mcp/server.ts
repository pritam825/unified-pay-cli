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
        description: 'Generate a hosted payment and checkout link across Stripe, Razorpay, or LemonSqueezy with custom pricing, customer prefill data, and expiration timeouts.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'The transaction amount specified in minor currency units (e.g. 50000 represents 500.00 in the target currency).',
            },
            currency: {
              type: 'string',
              description: 'Three-letter ISO currency code (e.g. INR, USD, EUR, GBP).',
            },
            description: {
              type: 'string',
              description: 'Item or service description displayed to the customer on the checkout screen.',
            },
            customerName: {
              type: 'string',
              description: 'Customer full legal or display name to prefill on the hosted checkout page.',
            },
            customerPhone: {
              type: 'string',
              description: 'Customer contact phone number including international country code (e.g. +919876543210).',
            },
            customerEmail: {
              type: 'string',
              description: 'Customer email address used for prefilling the checkout form and delivering receipts.',
            },
            expiresInMinutes: {
              type: 'number',
              description: 'Duration in minutes after which the generated checkout URL automatically expires and rejects attempts.',
            },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'lemonsqueezy'],
              description: 'Target payment gateway adapter to process the checkout creation request.',
            },
            smartRouting: {
              type: 'boolean',
              description: 'When true, automatically selects the most cost-effective gateway based on currency and transaction size.',
            },
          },
          required: ['amount', 'currency', 'description'],
        },
      },
      {
        name: 'compare_gateway_fees',
        description: 'Calculate and compare transaction processing fees, platform deductions, and net settled payouts across Razorpay, Stripe, and LemonSqueezy.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'The gross transaction amount in minor currency units (e.g. 50000 for 500.00).',
            },
            currency: {
              type: 'string',
              description: 'Three-letter ISO currency code to evaluate interchange and processing fee matrix (e.g. INR, USD, EUR).',
            },
          },
          required: ['amount', 'currency'],
        },
      },
      {
        name: 'trigger_mock_webhook',
        description: 'Synthesize and dispatch a cryptographically authentic HMAC-SHA256 signed webhook payload to a local or remote HTTP endpoint for development and testing.',
        inputSchema: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              description: 'Webhook event type to simulate (e.g. payment.captured, payment.failed, refund.processed, charge.succeeded).',
            },
            provider: {
              type: 'string',
              enum: ['razorpay', 'stripe'],
              description: 'Payment provider schema and signature algorithm standard to emulate.',
            },
            targetUrl: {
              type: 'string',
              description: 'Fully qualified HTTP/HTTPS destination URL of your backend webhook handler (e.g. http://localhost:3000/api/webhooks).',
            },
            secret: {
              type: 'string',
              description: 'Cryptographic signing secret used to compute and sign the HMAC-SHA256 signature header.',
            },
            amount: {
              type: 'number',
              description: 'Simulated charge amount in minor units to inject into the synthesized event data body.',
            },
          },
          required: ['event', 'provider', 'targetUrl'],
        },
      },
      {
        name: 'verify_webhook_signature',
        description: 'Verify the cryptographic HMAC-SHA256 authenticity and integrity of an incoming HTTP webhook payload against the provider signature header.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['razorpay', 'stripe'],
              description: 'Payment provider that dispatched the webhook payload.',
            },
            rawPayload: {
              type: 'string',
              description: 'The exact, unparsed raw UTF-8 string body received in the HTTP request.',
            },
            signature: {
              type: 'string',
              description: 'The verification signature header received from the request (e.g. x-razorpay-signature or stripe-signature).',
            },
            secret: {
              type: 'string',
              description: 'The configured shared webhook signing secret used to validate payload authenticity.',
            },
          },
          required: ['provider', 'rawPayload', 'signature', 'secret'],
        },
      },
      {
        name: 'get_payment_analytics',
        description: 'Retrieve real-time transaction performance metrics, aggregate settled revenue, and conversion success rates for a designated gateway.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'lemonsqueezy'],
              description: 'Payment gateway provider from which to aggregate transaction analytics.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of recent transaction records to inspect for analytics aggregation (default: 50).',
            },
          },
          required: ['provider'],
        },
      },
      {
        name: 'create_itemized_invoice',
        description: 'Construct an itemized invoice and checkout link with multiple product line items, quantities, and automated tax calculations.',
        inputSchema: {
          type: 'object',
          properties: {
            customerEmail: {
              type: 'string',
              description: 'Email address of the customer to associate with the invoice and send receipt notifications.',
            },
            currency: {
              type: 'string',
              description: 'Three-letter ISO currency code for all line items and final settlement (default: INR).',
            },
            items: {
              type: 'array',
              description: 'List of individual line items, including product names, unit prices, and quantities.',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Title or description of the product or service line item.',
                  },
                  quantity: {
                    type: 'number',
                    description: 'Number of units purchased for this line item.',
                  },
                  unitAmount: {
                    type: 'number',
                    description: 'Individual unit price in minor currency units (e.g. 2500 for 25.00).',
                  },
                },
                required: ['name', 'quantity', 'unitAmount'],
              },
            },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'lemonsqueezy'],
              description: 'Payment provider adapter to generate the itemized invoice checkout link.',
            },
          },
          required: ['customerEmail', 'items'],
        },
      },
      {
        name: 'create_refund',
        description: 'Initiate a full or partial refund for a previously captured charge or payment identifier.',
        inputSchema: {
          type: 'object',
          properties: {
            paymentId: {
              type: 'string',
              description: 'Unique payment identifier to refund (e.g. pay_N1xL5... for Razorpay or ch_3M5... for Stripe).',
            },
            amount: {
              type: 'number',
              description: 'Partial refund amount in minor currency units. If omitted, a full refund of the original charge is issued.',
            },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay'],
              description: 'Payment provider that processed the original transaction.',
            },
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
      const txns = await client.listTransactions((args?.limit as number) || 50);
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
      const provider = (args?.provider as PaymentProviderType) || GatewayRouter.recommendProvider((args?.currency as string) || 'INR', total);
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