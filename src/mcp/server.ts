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
// -------------------------------------------------------------------
// 1. Declare All AI Tools (ListTools)
// -------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_payment_link',
        description:
          'Generates a secure hosted payment checkout URL across Stripe, Razorpay, or LemonSqueezy. Supports custom transaction amounts, automatic currency formatting, customer prefill metadata (name, email, phone), customizable link expiry timeouts, and intelligent multi-gateway routing. Returns a JSON object containing the checkout URL, payment link ID, status, and assigned gateway provider.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description:
                'The total transaction amount represented in minor currency units (e.g., 50000 for $500.00 USD or ₹500.00 INR, 1500 for $15.00). Must be a positive integer.',
            },
            currency: {
              type: 'string',
              description:
                'Three-letter ISO 4217 currency code for the charge (e.g., "USD", "INR", "EUR", "GBP"). Defaults to "USD" or profile default if omitted.',
            },
            description: {
              type: 'string',
              description:
                'Detailed billing description or line item summary presented directly to the customer on the hosted checkout page.',
            },
            customerName: {
              type: 'string',
              description:
                'Customer full legal or billing name used to automatically prefill checkout contact forms.',
            },
            customerPhone: {
              type: 'string',
              description:
                'Customer contact phone number with international country calling code (e.g., "+919876543210" or "+14155552671") for SMS delivery and verification.',
            },
            customerEmail: {
              type: 'string',
              description:
                'Customer email address used for receipt delivery and automatic checkout form prefilling.',
            },
            expiresInMinutes: {
              type: 'number',
              description:
                'Time-to-live expiration window in minutes after which the generated checkout URL automatically expires and rejects payments. Defaults to no expiration if omitted.',
            },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'lemonsqueezy'],
              description:
                'Target payment provider adapter to execute the charge ("stripe" for international credit cards, "razorpay" for Indian domestic UPI/cards/netbanking, "lemonsqueezy" for merchant-of-record digital products). If omitted, smart routing is used.',
            },
            smartRouting: {
              type: 'boolean',
              description:
                'When set to true, automatically evaluates the currency and transaction size to route to the lowest fee gateway provider.',
            },
          },
          required: ['amount', 'currency', 'description'],
        },
      },
      {
        name: 'compare_gateway_fees',
        description:
          'Evaluates and compares the transaction processing fees, percentage cuts, fixed interchange fees, and estimated net payouts across Stripe, Razorpay, and LemonSqueezy for a given transaction amount and currency. Returns an itemized fee breakdown for each supported gateway alongside the recommended lowest-cost provider.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description:
                'The gross transaction amount in minor currency units (e.g., 10000 for $100.00 or ₹100.00) to calculate fee deductions against.',
            },
            currency: {
              type: 'string',
              description:
                'Three-letter ISO 4217 currency code (e.g., "USD", "INR", "EUR", "GBP") to evaluate currency-specific processing rate tiers.',
            },
          },
          required: ['amount', 'currency'],
        },
      },
      {
        name: 'trigger_mock_webhook',
        description:
          'Constructs and dispatches a cryptographically authentic HMAC-SHA256 signed synthetic webhook event payload directly to a local or remote backend endpoint. Useful for verifying webhook signature parsing, event processing handlers, and local integration pipelines without executing live card charges. Returns the HTTP status code, response headers, and response body received from the target server.',
        inputSchema: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              description:
                'The standardized webhook event name to emulate (e.g., "payment.captured", "payment.failed", "refund.processed", "payment_intent.succeeded", "charge.refunded").',
            },
            provider: {
              type: 'string',
              enum: ['razorpay', 'stripe'],
              description:
                'The payment gateway whose payload schema, signature format, and HTTP headers will be synthesized ("razorpay" adds "x-razorpay-signature", "stripe" adds "stripe-signature").',
            },
            targetUrl: {
              type: 'string',
              description:
                'Fully qualified HTTP or HTTPS destination URL of your backend webhook ingestion endpoint (e.g., "http://localhost:3000/api/webhooks" or "https://api.example.com/webhooks").',
            },
            secret: {
              type: 'string',
              description:
                'The shared webhook signing secret used to compute the HMAC-SHA256 signature header. If omitted, the active profile webhook secret is used.',
            },
            amount: {
              type: 'number',
              description:
                'Optional minor unit currency amount to inject into the mock payload data body (e.g., 5000 for $50.00). Defaults to 1000 if unspecified.',
            },
          },
          required: ['event', 'provider', 'targetUrl'],
        },
      },
      {
        name: 'verify_webhook_signature',
        description:
          'Validates the cryptographic HMAC-SHA256 signature and tamper-resistance of an incoming webhook HTTP request payload against a shared webhook signing secret. Returns a JSON boolean indicating whether the signature matches the payload digest.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['razorpay', 'stripe'],
              description:
                'The originating payment provider determining the signature algorithm ("stripe" parses timestamped t=,v1= signatures; "razorpay" computes standard hex HMAC-SHA256 digests).',
            },
            rawPayload: {
              type: 'string',
              description:
                'The exact unparsed UTF-8 raw string body of the incoming HTTP request before any JSON parsing or middleware transformations.',
            },
            signature: {
              type: 'string',
              description:
                'The cryptographic signature string extracted from the HTTP request headers ("x-razorpay-signature" for Razorpay, "stripe-signature" for Stripe).',
            },
            secret: {
              type: 'string',
              description:
                'The private shared webhook signing secret configured in your provider developer dashboard.',
            },
          },
          required: ['provider', 'rawPayload', 'signature', 'secret'],
        },
      },
      {
        name: 'get_payment_analytics',
        description:
          'Aggregates real-time transaction performance, total gross volume, captured revenue volume, settled payouts, and payment success/conversion rates by querying recent transaction histories across connected payment gateway accounts. Returns statistical aggregates and settlement ratios.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'lemonsqueezy'],
              description:
                'The target payment gateway account from which to fetch charge histories and calculate performance metrics.',
            },
            limit: {
              type: 'number',
              description:
                'The maximum number of recent historical transaction records to retrieve and analyze (integer between 1 and 100, default: 50).',
            },
          },
          required: ['provider'],
        },
      },
      {
        name: 'create_itemized_invoice',
        description:
          'Constructs a multi-item commercial invoice checkout link containing itemized product line descriptions, per-unit pricing, item quantities, total tax calculations, and customer billing details. Returns the generated hosted invoice payment URL and itemized receipt breakdown.',
        inputSchema: {
          type: 'object',
          properties: {
            customerEmail: {
              type: 'string',
              description:
                'Customer email address to which the official invoice payment notification and digital itemized receipt will be dispatched.',
            },
            currency: {
              type: 'string',
              description:
                'Three-letter ISO 4217 currency code applied across all line items and total invoice settlement (e.g., "USD", "INR", "EUR"). Defaults to "INR".',
            },
            items: {
              type: 'array',
              description:
                'Array of structured invoice line items detailing goods or services, unit quantities, and individual unit prices.',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Descriptive title or name of the individual product, license, or service line item.',
                  },
                  quantity: {
                    type: 'number',
                    description: 'Total number of units purchased for this line item (positive integer >= 1).',
                  },
                  unitAmount: {
                    type: 'number',
                    description: 'Price per individual unit specified in minor currency units (e.g., 2500 for $25.00 or ₹25.00).',
                  },
                },
                required: ['name', 'quantity', 'unitAmount'],
              },
            },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'lemonsqueezy'],
              description:
                'Payment gateway adapter used to issue and host the invoice checkout link. If omitted, smart routing selects the optimal gateway based on total invoice volume.',
            },
          },
          required: ['customerEmail', 'items'],
        },
      },
      {
        name: 'create_refund',
        description:
          'Executes an immediate full or partial monetary refund for a previously settled payment or charge transaction across supported payment gateways. Returns a JSON confirmation object containing the refund ID, status, refunded amount, and currency.',
        inputSchema: {
          type: 'object',
          properties: {
            paymentId: {
              type: 'string',
              description:
                'The unique gateway transaction identifier of the charge to refund (e.g., "pay_N1xL5Z81bABCDE" for Razorpay or "ch_3M52pELkdjaWFaKS0ABCDE" / "pi_3M52pE..." for Stripe).',
            },
            amount: {
              type: 'number',
              description:
                'Optional minor unit amount to refund for partial reversals (e.g., 2500 for a $25.00 refund on a $100.00 charge). If omitted or null, a full 100% refund of the original payment amount is processed.',
            },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay'],
              description:
                'The originating payment provider that processed the initial charge transaction.',
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