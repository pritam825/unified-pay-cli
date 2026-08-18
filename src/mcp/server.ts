import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { configStore } from '../config/store.js';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { WebhookVerifier } from '../crypto/WebhookVerifier.js';

function getProvider(name: string) {
  if (name === 'stripe') {
    const key = configStore.get('stripeApiKey') as string;
    if (!key) throw new Error('Stripe API Key missing. Run: pay config --stripe-key <key>');
    return new StripeAdapter(key);
  }
  if (name === 'razorpay') {
    const id = configStore.get('razorpayKeyId') as string;
    const secret = configStore.get('razorpayKeySecret') as string;
    if (!id || !secret) throw new Error('Razorpay keys missing. Run: pay config --razorpay-id <id> --razorpay-secret <secret>');
    return new RazorpayAdapter(id, secret);
  }
  throw new Error(`Unsupported provider: ${name}`);
}

export function startMCPServer() {
  const server = new Server(
    { name: 'unified-pay', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'create_payment_link',
          description: 'Create a checkout payment link via Stripe or Razorpay',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'], description: 'Payment gateway' },
              amount: { type: 'number', description: 'Amount in minor units (paise/cents)' },
              currency: { type: 'string', description: 'Currency code (INR, USD, EUR)' },
              description: { type: 'string', description: 'Payment description/note' },
            },
            required: ['provider', 'amount', 'currency', 'description'],
          },
        },
        {
          name: 'list_transactions',
          description: 'Fetch recent transactions from Stripe or Razorpay',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              limit: { type: 'number', description: 'Number of items to fetch (default: 5)' },
            },
            required: ['provider'],
          },
        },
        {
          name: 'get_payment_status',
          description: 'Retrieve real-time status of a charge or payment ID',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              paymentId: { type: 'string', description: 'Charge ID or Payment ID (e.g. ch_xxx, pay_xxx)' },
            },
            required: ['provider', 'paymentId'],
          },
        },
        {
          name: 'create_refund',
          description: 'Refund a full or partial payment',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              paymentId: { type: 'string', description: 'Charge ID or Payment ID to refund' },
              amount: { type: 'number', description: 'Optional partial amount in minor units (cents/paise)' },
            },
            required: ['provider', 'paymentId'],
          },
        },
        {
          name: 'get_refund_status',
          description: 'Retrieve live status and processing progression for a refund ID (e.g. rfnd_xxx, re_xxx)',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              refundId: { type: 'string', description: 'Refund ID (e.g., rfnd_TRNTRFvhQ6NDKx or re_123)' },
            },
            required: ['provider', 'refundId'],
          },
        },
        {
          name: 'list_refunds',
          description: 'List recent refunds from Stripe or Razorpay',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              limit: { type: 'number', description: 'Number of refunds to fetch (default: 5)' },
            },
            required: ['provider'],
          },
        },
        {
          name: 'verify_webhook_signature',
          description: 'Verify HMAC-SHA256 authenticity of an incoming Stripe or Razorpay webhook payload',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              rawPayload: { type: 'string', description: 'Exact raw body string received in the HTTP request' },
              signature: { type: 'string', description: 'Value of x-razorpay-signature or stripe-signature header' },
              secret: { type: 'string', description: 'Webhook signing secret' }
            },
            required: ['provider', 'rawPayload', 'signature', 'secret']
          }
        }
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const adapter = getProvider(args.provider);

    try {
      if (name === 'create_payment_link') {
        const result = await adapter.createPaymentLink({
          amount: args.amount,
          currency: args.currency,
          description: args.description,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      if (name === 'list_transactions') {
        const txns = await adapter.listTransactions(args.limit || 5);
        return { content: [{ type: 'text', text: JSON.stringify(txns, null, 2) }] };
      }

      if (name === 'get_payment_status') {
        const status = await adapter.getPaymentStatus(args.paymentId);
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      }

      if (name === 'create_refund') {
        const refund = await adapter.createRefund({
          paymentId: args.paymentId,
          amount: args.amount,
        });
        return { content: [{ type: 'text', text: JSON.stringify(refund, null, 2) }] };
      }

      if (name === 'get_refund_status') {
        const status = await adapter.getRefundStatus(args.refundId);
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      }

      if (name === 'list_refunds') {
        const refunds = await adapter.listRefunds(args.limit || 5);
        return { content: [{ type: 'text', text: JSON.stringify(refunds, null, 2) }] };
      }

      // 2. Execution Handler
      if (name === 'verify_webhook_signature') {
        let isValid = false;
        if (args.provider === 'razorpay') {
          isValid = WebhookVerifier.verifyRazorpaySignature(args.rawPayload, args.signature, args.secret);
        } else if (args.provider === 'stripe') {
          isValid = WebhookVerifier.verifyStripeSignature(args.rawPayload, args.signature, args.secret);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              provider: args.provider,
              verified: isValid,
              message: isValid ? 'Signature is valid and authentic.' : 'Invalid signature. Payload may have been tampered with.'
            }, null, 2)
          }]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
      return { isError: true, content: [{ type: 'text', text: `Error: ${msg}` }] };
    }
  });

  const transport = new StdioServerTransport();
  server.connect(transport);
}