#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import http from 'http';
import { configStore } from '../config/store.js';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { startMCPServer } from '../mcp/server.js';

const program = new Command();

program
    .name('pay')
    .description('Unified Payment Gateway CLI & MCP Bridge')
    .version('0.1.0');

function getAdapter(provider: string) {
    if (provider === 'stripe') {
        const key = configStore.get('stripeApiKey') as string;
        if (!key) throw new Error('Stripe API Key missing. Run: pay config --stripe-key <key>');
        return new StripeAdapter(key);
    }
    if (provider === 'razorpay') {
        const id = configStore.get('razorpayKeyId') as string;
        const secret = configStore.get('razorpayKeySecret') as string;
        if (!id || !secret) throw new Error('Razorpay keys missing. Run: pay config --razorpay-id <id> --razorpay-secret <secret>');
        return new RazorpayAdapter(id, secret);
    }
    throw new Error(`Unsupported provider: ${provider}`);
}

// 1. Config Command
program
    .command('config')
    .description('Set credentials for payment providers')
    .option('--stripe-key <key>', 'Stripe API Secret Key')
    .option('--razorpay-id <id>', 'Razorpay Key ID')
    .option('--razorpay-secret <secret>', 'Razorpay Key Secret')
    .action((opts: any) => {
        const keysSet: string[] = [];
        if (opts.stripeKey) { configStore.set('stripeApiKey', opts.stripeKey); keysSet.push('Stripe Key'); }
        if (opts.razorpayId) { configStore.set('razorpayKeyId', opts.razorpayId); keysSet.push('Razorpay Key ID'); }
        if (opts.razorpaySecret) { configStore.set('razorpayKeySecret', opts.razorpaySecret); keysSet.push('Razorpay Key Secret'); }

        if (keysSet.length === 0) {
            console.log(chalk.yellow('No keys provided. Pass flags like --stripe-key <key>'));
            return;
        }
        console.log(chalk.green(`✔ Saved configuration for: ${keysSet.join(', ')}`));
    });

// 2. Link Command (Interactive + Flags)
program
    .command('link')
    .description('Create a quick payment link')
    .option('-p, --provider <provider>', 'Provider (stripe or razorpay)')
    .option('-a, --amount <amount>', 'Amount in minor units (cents/paise)', parseInt)
    .option('-c, --currency <currency>', 'Currency code')
    .option('-d, --desc <description>', 'Payment description')
    .action(async (opts: any) => {
        let { provider, amount, currency, desc } = opts;

        if (!provider || !amount || !desc) {
            const answers = await inquirer.prompt([
                {
                    type: 'select',
                    name: 'provider',
                    message: 'Select payment provider:',
                    choices: [{ name: 'stripe', value: 'stripe' }, { name: 'razorpay', value: 'razorpay' }],
                    when: !provider,
                },
                {
                    type: 'number',
                    name: 'amount',
                    message: 'Enter amount in smallest unit (e.g. 50000 = ₹500):',
                    when: !amount,
                    validate: (val) => (val && val > 0 ? true : 'Amount must be > 0'),
                },
                {
                    type: 'input',
                    name: 'currency',
                    message: 'Currency:',
                    default: (ans: any) => ((ans.provider || provider) === 'razorpay' ? 'INR' : 'USD'),
                    when: !currency,
                },
                {
                    type: 'input',
                    name: 'desc',
                    message: 'Payment description:',
                    when: !desc,
                },
            ]);

            provider = provider || answers.provider;
            amount = amount || answers.amount;
            currency = currency || answers.currency;
            desc = desc || answers.desc;
        }

        const spinner = ora(`Generating ${provider} payment link...`).start();
        try {
            const adapter = getAdapter(provider);
            const result = await adapter.createPaymentLink({ amount, currency, description: desc });
            spinner.succeed(chalk.bold('Payment link generated!'));
            console.log(chalk.cyan(`\nURL: ${result.url}`));
            console.log(chalk.gray(`ID:  ${result.id}`));
        } catch (err: any) {
            const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
            spinner.fail(chalk.red(`Error: ${msg}`));
        }
    });

// -------------------------------------------------------------
// 3. 'txn' COMMAND GROUP (With ID auto-detection)
// -------------------------------------------------------------
const txn = program.command('txn').description('Manage and inspect transactions');

txn
    .command('list')
    .description('List recent transactions')
    .requiredOption('-p, --provider <provider>', 'Provider (stripe or razorpay)')
    .option('-l, --limit <number>', 'Number of transactions', parseInt, 5)
    .action(async (opts: any) => {
        const spinner = ora(`Fetching ${opts.provider} transactions...`).start();
        try {
            const adapter = getAdapter(opts.provider);
            const txns = await adapter.listTransactions(opts.limit);
            spinner.stop();
            if (!txns || txns.length === 0) {
                console.log(chalk.yellow('No transactions found.'));
                return;
            }
            console.table(txns);
        } catch (err: any) {
            spinner.fail(chalk.red(`Error: ${err.message}`));
        }
    });

txn
    .command('status <id>')
    .description('Get details of a payment or refund by ID')
    .requiredOption('-p, --provider <provider>', 'Provider (stripe or razorpay)')
    .action(async (id: string, opts: any) => {
        const isRefund = id.startsWith('rfnd_') || id.startsWith('re_');
        const spinner = ora(`Fetching status for ${id}...`).start();

        try {
            const adapter = getAdapter(opts.provider);
            if (isRefund) {
                const res = await adapter.getRefundStatus(id);
                spinner.succeed('Refund details retrieved:');
                console.table([res]);
            } else {
                const res = await adapter.getPaymentStatus(id);
                spinner.succeed('Transaction details retrieved:');
                console.table([res]);
            }
        } catch (err: any) {
            const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
            spinner.fail(chalk.red(`Error: ${msg}`));
        }
    });

// -------------------------------------------------------------
// 4. 'refund' COMMAND GROUP
// -------------------------------------------------------------
const refund = program.command('refund').description('Manage and inspect refunds');

refund
    .command('create <paymentId>')
    .description('Issue a refund for a transaction')
    .requiredOption('-p, --provider <provider>', 'Provider (stripe or razorpay)')
    .option('-a, --amount <amount>', 'Partial amount in minor units', parseInt)
    .action(async (paymentId: string, opts: any) => {
        const spinner = ora(`Issuing refund on ${opts.provider}...`).start();
        try {
            const adapter = getAdapter(opts.provider);
            const res = await adapter.createRefund({ paymentId, amount: opts.amount });
            spinner.succeed(chalk.bold('Refund processed successfully!'));
            console.log(chalk.cyan(`Refund ID: ${res.id}`));
            console.log(chalk.gray(`Status:    ${res.status}`));
        } catch (err: any) {
            const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
            spinner.fail(chalk.red(`Error: ${msg}`));
        }
    });

refund
    .command('status <refundId>')
    .description('Check the live progression/status of a refund')
    .requiredOption('-p, --provider <provider>', 'Provider (stripe or razorpay)')
    .action(async (refundId: string, opts: any) => {
        const spinner = ora(`Fetching refund status for ${refundId}...`).start();
        try {
            const adapter = getAdapter(opts.provider);
            const res = await adapter.getRefundStatus(refundId);
            spinner.succeed('Refund status:');
            console.table([res]);
        } catch (err: any) {
            const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
            spinner.fail(chalk.red(`Error: ${msg}`));
        }
    });

refund
    .command('list')
    .description('List recent refunds')
    .requiredOption('-p, --provider <provider>', 'Provider (stripe or razorpay)')
    .option('-l, --limit <number>', 'Number of refunds', parseInt, 5)
    .action(async (opts: any) => {
        const spinner = ora(`Fetching ${opts.provider} refunds...`).start();
        try {
            const adapter = getAdapter(opts.provider);
            const res = await adapter.listRefunds(opts.limit);
            spinner.stop();
            if (!res || res.length === 0) {
                console.log(chalk.yellow('No refunds found.'));
                return;
            }
            console.table(res);
        } catch (err: any) {
            spinner.fail(chalk.red(`Error: ${err.message}`));
        }
    });

// 5. Local Webhook Listener
program
    .command('listen')
    .description('Start a local webhook inspection server')
    .option('-p, --port <port>', 'Local port to bind', parseInt, 4242)
    .action((opts: any) => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                const time = new Date().toLocaleTimeString();
                console.log(chalk.bold.magenta(`\n[${time}] Received Webhook on ${req.url}`));
                try {
                    const parsed = JSON.parse(body);
                    console.log(chalk.green(JSON.stringify(parsed, null, 2)));
                } catch {
                    console.log(chalk.gray(body || '(Empty payload)'));
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ received: true }));
            });
        });

        server.listen(opts.port, () => {
            console.log(chalk.cyan.bold(`\n⚡ Webhook listener running at http://localhost:${opts.port}/`));
            console.log(chalk.gray('Waiting for events from Stripe or Razorpay... (Ctrl+C to quit)\n'));
        });
    });

// 6. MCP Server
program
    .command('mcp')
    .description('Start Model Context Protocol stdio server')
    .action(() => {
        startMCPServer();
    });

program.parse(process.argv);