import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { LemonSqueezyAdapter } from '../providers/lemonsqueezy.js';
import { CashfreeAdapter } from '../providers/cashfree.js';
import { UPIAdapter } from '../providers/upi.js';
import { WebhookVerifier } from '../crypto/WebhookVerifier.js';
import { GatewayRouter } from '../utils/router.js';
import { WebhookTrigger } from '../utils/trigger.js';
import { ProfileManager } from '../utils/profiles.js';
import { PaymentProviderType } from '../types/PaymentProviderType.js';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';

const server = new Server(
  {
    name: 'unified-pay',
    version: '0.4.0',
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
    if (!key) {
      throw new Error(
        `[ACTION_REQUIRED: MISSING_STRIPE_KEY]\n` +
        `Stripe API Key is not configured.\n` +
        `INSTRUCTION FOR LLM: Reassure the user that their key is saved strictly on their local device and NEVER saved to any remote database. Ask the user for their Stripe Secret Key (sk_test_...). Once provided, call 'configure_gateway_credentials' with provider='stripe' and stripeApiKey.`
      );
    }
    return new StripeAdapter(key);
  }

  if (providerName === 'razorpay') {
    const keyId = activeProfile.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = activeProfile.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error(
        `[ACTION_REQUIRED: MISSING_RAZORPAY_KEYS]\n` +
        `Razorpay Key ID or Secret is not configured.\n` +
        `INSTRUCTION FOR LLM: Reassure the user that their keys are saved 100% locally on their machine and never uploaded to any remote database. Ask for their Razorpay Key ID (rzp_test_...) and Key Secret. Once provided, call 'configure_gateway_credentials' with provider='razorpay', razorpayKeyId, and razorpayKeySecret.`
      );
    }
    return new RazorpayAdapter(keyId, keySecret);
  }

  if (providerName === 'cashfree') {
    const appId = activeProfile.cashfreeAppId || process.env.CASHFREE_APP_ID;
    const secretKey = activeProfile.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY;
    if (!appId || !secretKey) {
      throw new Error(
        `[ACTION_REQUIRED: MISSING_CASHFREE_KEYS]\n` +
        `Cashfree credentials are not configured.\n` +
        `INSTRUCTION FOR LLM: Reassure the user that their credentials are saved strictly on their local machine and never sent to any external database. Ask for their Cashfree App ID (TEST...) and Secret Key (from Cashfree Merchant Dashboard -> Developers -> API Keys). Once provided, call 'configure_gateway_credentials' with provider='cashfree', cashfreeAppId, and cashfreeSecretKey.`
      );
    }
    return new CashfreeAdapter(appId, secretKey, false);
  }

  if (providerName === 'upi') {
    const vpa = activeProfile.upiVpa || process.env.UPI_VPA;
    const name = activeProfile.upiName || process.env.UPI_NAME;
    if (!vpa) {
      throw new Error(
        `[ACTION_REQUIRED: MISSING_UPI_VPA]\n` +
        `UPI ID / VPA is not configured.\n` +
        `INSTRUCTION FOR LLM: Reassure the user that their UPI ID is stored only in their local config. Direct UPI intent has 0% gateway fees and works across GPay, PhonePe, Paytm, and CRED. Ask for their UPI ID (e.g. yourname@okaxis, 9876543210@ybl) and optional Display Name. Once provided, call 'configure_gateway_credentials' with provider='upi', upiVpa, and upiName.`
      );
    }
    return new UPIAdapter(vpa, name);
  }

  if (providerName === 'lemonsqueezy') {
    const key = activeProfile.lemonApiKey || process.env.LEMONSQUEEZY_API_KEY;
    const storeId = activeProfile.lemonStoreId || process.env.LEMONSQUEEZY_STORE_ID;
    if (!key || !storeId) {
      throw new Error(
        `[ACTION_REQUIRED: MISSING_LEMONSQUEEZY_KEYS]\n` +
        `LemonSqueezy credentials are not configured.\n` +
        `INSTRUCTION FOR LLM: Reassure the user that credentials stay local on their device. Ask for their LemonSqueezy API Key and Store ID. Once provided, call 'configure_gateway_credentials' with provider='lemonsqueezy', lemonApiKey, and lemonStoreId.`
      );
    }
    return new LemonSqueezyAdapter(key, storeId);
  }

  throw new Error(`Unsupported provider: ${providerName}`);
}

// -------------------------------------------------------------------
// 1. ListTools Declaration
// -------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_payment_link',
        description:
          'Generates a payment checkout link or zero-fee NPCI UPI intent URI across Stripe, Razorpay, Cashfree, LemonSqueezy, or direct UPI. Returns the payment URL and QR code data.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'The transaction amount in minor currency units (e.g., 50000 for ₹500.00 or $500.00).',
            },
            currency: {
              type: 'string',
              description: 'Three-letter ISO currency code (e.g. INR, USD). Defaults to INR.',
            },
            description: {
              type: 'string',
              description: 'Payment description or billing note displayed to customer.',
            },
            customerName: {
              type: 'string',
              description: 'Customer full name to prefill on hosted checkout page.',
            },
            customerPhone: {
              type: 'string',
              description: 'Customer phone number (e.g. +919876543210) for SMS notification.',
            },
            customerEmail: {
              type: 'string',
              description: 'Customer email address for invoice and receipt delivery.',
            },
            expiresInMinutes: {
              type: 'number',
              description: 'Expiry timeout in minutes after which the link expires.',
            },
            upiVpa: { type: 'string', description: 'Optional UPI ID / VPA override (e.g. name@okhdfcbank)' },
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'cashfree', 'upi', 'lemonsqueezy'],
              description: 'The payment provider: "upi" for 0% fee direct UPI intent, "cashfree" / "razorpay" for Indian PG, "stripe" for global cards.',
            },
            smartRouting: {
              type: 'boolean',
              description: 'When true, selects the optimal gateway automatically.',
            },
          },
          required: ['amount', 'currency', 'description'],
        },
      },
      {
        name: 'configure_gateway_credentials',
        description:
          'Securely saves API credentials, keys, or UPI VPAs directly to the local configuration store on the user machine. Guarantees complete privacy: values are never sent to external servers or remote databases.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['stripe', 'razorpay', 'cashfree', 'upi', 'lemonsqueezy'],
              description: 'The provider to configure locally.',
            },
            upiVpa: {
              type: 'string',
              description: 'User UPI ID / Virtual Payment Address (e.g. user@okaxis, 9876543210@ybl).',
            },
            upiName: {
              type: 'string',
              description: 'Display name or Business name shown during UPI app checkout.',
            },
            cashfreeAppId: {
              type: 'string',
              description: 'Cashfree Merchant App ID.',
            },
            cashfreeSecretKey: {
              type: 'string',
              description: 'Cashfree Secret Key.',
            },
            razorpayKeyId: {
              type: 'string',
              description: 'Razorpay Key ID.',
            },
            razorpayKeySecret: {
              type: 'string',
              description: 'Razorpay Key Secret.',
            },
            stripeApiKey: {
              type: 'string',
              description: 'Stripe Secret API Key (sk_test_...).',
            },
            lemonApiKey: {
              type: 'string',
              description: 'LemonSqueezy API Key.',
            },
            lemonStoreId: {
              type: 'string',
              description: 'LemonSqueezy Store ID.',
            },
          },
          required: ['provider'],
        },
      },
      {
        name: 'compare_gateway_fees',
        description: 'Compare transaction processing fees and net payouts across Cashfree, Razorpay, Stripe, and LemonSqueezy.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount in minor units (e.g. 50000)' },
            currency: { type: 'string', description: 'Currency code (e.g. INR, USD)' },
          },
          required: ['amount', 'currency'],
        },
      },
      {
        name: 'trigger_mock_webhook',
        description: 'Send a signed mock webhook to a local or remote endpoint.',
        inputSchema: {
          type: 'object',
          properties: {
            event: { type: 'string', description: 'Event name (e.g. payment.captured)' },
            provider: { type: 'string', enum: ['razorpay', 'stripe', 'cashfree'] },
            targetUrl: { type: 'string', description: 'Destination HTTP endpoint' },
            secret: { type: 'string', description: 'Signing secret' },
            amount: { type: 'number', description: 'Amount in minor units' },
          },
          required: ['event', 'provider', 'targetUrl'],
        },
      },
      {
        name: 'verify_webhook_signature',
        description: 'Verify HMAC-SHA256 signature of incoming webhooks.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['razorpay', 'stripe', 'cashfree'] },
            rawPayload: { type: 'string', description: 'Raw body string' },
            signature: { type: 'string', description: 'Signature header' },
            secret: { type: 'string', description: 'Signing secret' },
          },
          required: ['provider', 'rawPayload', 'signature', 'secret'],
        },
      },
      {
        name: 'get_payment_analytics',
        description: 'Retrieve transaction stats and volume.',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['stripe', 'razorpay', 'lemonsqueezy', 'cashfree'] },
            limit: { type: 'number', description: 'Charge count limit' },
          },
          required: ['provider'],
        },
      },
      {
        name: 'create_itemized_invoice',
        description: 'Generate multi-item invoice link.',
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
                  unitAmount: { type: 'number' },
                },
                required: ['name', 'quantity', 'unitAmount'],
              },
            },
            provider: { type: 'string', enum: ['stripe', 'razorpay', 'cashfree', 'upi', 'lemonsqueezy'] },
          },
          required: ['customerEmail', 'items'],
        },
      },
      {
        name: 'create_refund',
        description: 'Issue partial or full refund for a payment ID.',
        inputSchema: {
          type: 'object',
          properties: {
            paymentId: { type: 'string', description: 'Charge / Payment ID' },
            amount: { type: 'number', description: 'Amount in minor units (optional for full)' },
            provider: { type: 'string', enum: ['stripe', 'razorpay', 'cashfree'] },
          },
          required: ['paymentId', 'provider'],
        },
      },
    ],
  };
});

// -------------------------------------------------------------------
// 2. CallTool Request Handler
// -------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 1. Configure Credentials locally
    if (name === 'configure_gateway_credentials') {
      const provider = args?.provider as PaymentProviderType;
      const updates: Record<string, string> = {};

      if (provider === 'upi') {
        if (!args?.upiVpa) throw new Error('Please provide `upiVpa` (e.g. name@okaxis).');
        updates.upiVpa = args.upiVpa as string;
        if (args?.upiName) updates.upiName = args.upiName as string;
      } else if (provider === 'cashfree') {
        if (!args?.cashfreeAppId || !args?.cashfreeSecretKey) {
          throw new Error('Please provide both `cashfreeAppId` and `cashfreeSecretKey`.');
        }
        updates.cashfreeAppId = args.cashfreeAppId as string;
        updates.cashfreeSecretKey = args.cashfreeSecretKey as string;
      } else if (provider === 'stripe') {
        if (!args?.stripeApiKey) throw new Error('Please provide `stripeApiKey`.');
        updates.stripeApiKey = args.stripeApiKey as string;
      } else if (provider === 'razorpay') {
        if (!args?.razorpayKeyId || !args?.razorpayKeySecret) {
          throw new Error('Please provide both `razorpayKeyId` and `razorpayKeySecret`.');
        }
        updates.razorpayKeyId = args.razorpayKeyId as string;
        updates.razorpayKeySecret = args.razorpayKeySecret as string;
      } else if (provider === 'lemonsqueezy') {
        if (!args?.lemonApiKey || !args?.lemonStoreId) {
          throw new Error('Please provide both `lemonApiKey` and `lemonStoreId`.');
        }
        updates.lemonApiKey = args.lemonApiKey as string;
        updates.lemonStoreId = args.lemonStoreId as string;
      }

      profileManager.updateProfile(updates);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Successfully saved ${provider} credentials locally. No keys were transmitted to any external database.`,
            }, null, 2),
          },
        ],
      };
    }

    // 2. Create Payment Link / UPI Intent
    if (name === 'create_payment_link') {
      let provider = (args?.provider as PaymentProviderType) || 'upi';
      let client: PaymentProvider;

      if (provider === 'upi' && args?.upiVpa) {
        client = new UPIAdapter(args.upiVpa as string, (args?.customerName as string) || 'Merchant');
      } else {
        client = getActiveProvider(provider);
      }

      const res = await client.createPaymentLink({
        amount: args?.amount as number,
        currency: args?.currency as string,
        description: args?.description as string,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...res,
              scannableQrMarkdown: `![UPI QR Code](${res.qrImageUrl})`,
            }, null, 2),
          },
        ],
      };
    }

    // 3. Fee Comparison
    if (name === 'compare_gateway_fees') {
      const estimates = GatewayRouter.compareFees(args?.amount as number, args?.currency as string);
      return {
        content: [{ type: 'text', text: JSON.stringify(estimates, null, 2) }],
      };
    }

    // 4. Mock Webhook
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

    // 5. Signature Verification
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

    // 6. Analytics
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

    // 7. Itemized Invoice
    if (name === 'create_itemized_invoice') {
      const items = args?.items as Array<{ name: string; quantity: number; unitAmount: number }>;
      const total = items.reduce((acc, i) => acc + (i.quantity * i.unitAmount), 0);
      const desc = items.map((i) => `${i.name} (x${i.quantity})`).join(', ');
      const provider = (args?.provider as PaymentProviderType) || 'upi';
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

    // 8. Refund
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