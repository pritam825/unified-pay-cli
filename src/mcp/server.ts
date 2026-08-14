import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { configStore } from '../config/store.js';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';

export function startMCPServer() {
  const server = new Server(
    { name: 'pay-cli-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // 1. Register available MCP Tools for AI agents
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'create_payment_link',
          description: 'Generates a payment link using Stripe or Razorpay',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: ['stripe', 'razorpay'] },
              amount: { type: 'number', description: 'Amount in minor units (e.g., 500 = $5.00 or ₹5.00)' },
              currency: { type: 'string', description: '3-letter ISO code like USD, INR' },
              description: { type: 'string', description: 'Description of item/service' },
            },
            required: ['provider', 'amount', 'currency', 'description'],
          },
        },
      ],
    };
  });

  // 2. Handle Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'create_payment_link') {
      const args = request.params.arguments as any;

      try {
        let adapter;
        if (args.provider === 'stripe') {
          adapter = new StripeAdapter(configStore.get('stripeApiKey') as string);
        } else {
          adapter = new RazorpayAdapter(
            configStore.get('razorpayKeyId') as string,
            configStore.get('razorpayKeySecret') as string
          );
        }

        const result = await adapter.createPaymentLink(args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, url: result.url, id: result.id }),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }

    throw new Error('Tool not found');
  });

  const transport = new StdioServerTransport();
  server.connect(transport);
}