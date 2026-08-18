#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import http from 'http';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { LemonSqueezyAdapter } from '../providers/lemonsqueezy.js';
import { WebhookVerifier } from '../crypto/WebhookVerifier.js';
import { renderTerminalQR } from '../utils/qr.js';
import { GatewayRouter } from '../utils/router.js';
import { WebhookTrigger } from '../utils/trigger.js';
import { ProfileManager } from '../utils/profiles.js';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { PaymentProviderType } from '../types/PaymentProviderType.js';

const program = new Command();
const profileManager = new ProfileManager();

function getActiveProvider(providerName: PaymentProviderType): PaymentProvider {
    const activeProfile = profileManager.getProfile();

    if (providerName === 'stripe') {
        const key = activeProfile.stripeApiKey || process.env.STRIPE_API_KEY;
        if (!key) throw new Error(`Stripe API key missing. Set via: pay config --stripe-key <key>`);
        return new StripeAdapter(key);
    }

    if (providerName === 'razorpay') {
        const keyId = activeProfile.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
        const keySecret = activeProfile.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) throw new Error(`Razorpay keys missing. Set via: pay config --razorpay-id <id> --razorpay-secret <sec>`);
        return new RazorpayAdapter(keyId, keySecret);
    }

    if (providerName === 'lemonsqueezy') {
        const key = activeProfile.lemonApiKey || process.env.LEMONSQUEEZY_API_KEY;
        const storeId = activeProfile.lemonStoreId || process.env.LEMONSQUEEZY_STORE_ID;
        if (!key || !storeId) throw new Error(`LemonSqueezy credentials missing. Set via: pay config --lemonsqueezy-key <key> --lemonsqueezy-store <id>`);
        return new LemonSqueezyAdapter(key, storeId);
    }

    throw new Error(`Unsupported provider: ${providerName}`);
}

program
    .name('pay')
    .description('Universal Payment Gateway CLI & MCP Engine (Stripe, Razorpay, LemonSqueezy)')
    .version('0.3.0');

// -------------------------------------------------------------
// 1. Config & Profile Switching (Feature 5)
// -------------------------------------------------------------
program
    .command('config')
    .description('Set credentials for active profile')
    .option('--stripe-key <key>', 'Stripe Secret Key')
    .option('--razorpay-id <id>', 'Razorpay Key ID')
    .option('--razorpay-secret <secret>', 'Razorpay Key Secret')
    .option('--lemonsqueezy-key <key>', 'LemonSqueezy API Key')
    .option('--lemonsqueezy-store <storeId>', 'LemonSqueezy Store ID')
    .action((opts: any) => {
        const active = profileManager.getActiveProfileName();
        profileManager.saveProfile(active, {
            stripeApiKey: opts.stripeKey,
            razorpayKeyId: opts.razorpayId,
            razorpayKeySecret: opts.razorpaySecret,
            lemonApiKey: opts.lemonsqueezyKey,
            lemonStoreId: opts.lemonsqueezyStore,
        });
        console.log(chalk.green(`✔ Saved configuration for profile: [${chalk.bold(active)}]`));
    });

program
    .command('profile')
    .description('Manage and switch between client/environment profiles')
    .argument('[action]', 'list | use | create | current', 'list')
    .argument('[name]', 'Profile name (for use/create)')
    .action((action: string, name?: string) => {
        if (action === 'list') {
            const active = profileManager.getActiveProfileName();
            console.log(chalk.cyan.bold('\n👥 Available Profiles:'));
            profileManager.listProfiles().forEach((p) => {
                const marker = p === active ? chalk.green('● (active)') : chalk.gray('○');
                console.log(`  ${marker} ${p}`);
            });
            console.log();
        } else if (action === 'use' && name) {
            profileManager.setActiveProfile(name);
            console.log(chalk.green(`✔ Switched active profile to: ${chalk.bold(name)}`));
        } else if (action === 'current') {
            console.log(chalk.cyan(`Current profile: ${chalk.bold(profileManager.getActiveProfileName())}`));
        }
    });

// -------------------------------------------------------------
// 2. Payment Link with QR Code, Expiry & Smart Routing (Features 1, 2, 3)
// -------------------------------------------------------------
program
    .command('link')
    .description('Create a checkout link with customer prefill, QR code, and expiry timeout')
    .option('-p, --provider <provider>', 'stripe | razorpay | lemonsqueezy')
    .option('-a, --amount <amount>', 'Amount in minor units (e.g. 50000 = ₹500)', (v) => parseInt(v, 10))
    .option('-c, --currency <currency>', 'Currency code', 'INR')
    .option('-d, --desc <description>', 'Payment description')
    .option('-e, --expire <minutes>', 'Expiry timeout in minutes', (v) => parseInt(v, 10))
    .option('--name <customerName>', 'Prefill customer name')
    .option('--email <customerEmail>', 'Prefill customer email')
    .option('--phone <customerPhone>', 'Prefill customer mobile number (e.g. +919876543210)')
    .option('--qr', 'Render ASCII QR code in terminal', true)
    .option('--smart', 'Auto-select optimal gateway')
    .action(async (opts: any) => {
        try {
            let { provider, amount, currency, desc, expire, name, email, phone } = opts;

            if (opts.smart && currency && amount) {
                provider = GatewayRouter.recommendProvider(currency, amount);
            }

            if (!provider || !amount || !desc) {
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'provider',
                        message: 'Select payment provider:',
                        choices: ['razorpay', 'stripe', 'lemonsqueezy'],
                        default: 'razorpay',
                        when: !provider,
                    },
                    {
                        type: 'number',
                        name: 'amount',
                        message: 'Enter amount in smallest unit (e.g. 50000 = ₹500):',
                        when: !amount,
                    },
                    {
                        type: 'input',
                        name: 'currency',
                        message: 'Currency:',
                        default: 'INR',
                        when: !currency,
                    },
                    {
                        type: 'input',
                        name: 'desc',
                        message: 'Payment description:',
                        when: !desc,
                    },
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Customer Name (optional):',
                        when: !name,
                    },
                    {
                        type: 'input',
                        name: 'phone',
                        message: 'Customer Mobile (optional, e.g. +919876543210):',
                        when: !phone,
                    },
                    {
                        type: 'input',
                        name: 'email',
                        message: 'Customer Email (optional):',
                        when: !email,
                    },
                ]);

                provider = provider || answers.provider;
                amount = amount || answers.amount;
                currency = currency || answers.currency;
                desc = desc || answers.desc;
                name = name || answers.name;
                phone = phone || answers.phone;
                email = email || answers.email;
            }

            const client = getActiveProvider(provider);
            console.log(chalk.blue(`⏳ Generating prefilled checkout link on ${provider}...`));

            const result = await client.createPaymentLink({
                amount,
                currency,
                description: desc,
                customerName: name || undefined,
                customerPhone: phone || undefined,
                customerEmail: email || undefined,
                expiresInMinutes: expire > 0 ? expire : undefined,
            });

            console.log(chalk.green.bold('\n✔ Payment Link Created Successfully:'));
            console.log(`  ${chalk.cyan('URL:')}         ${chalk.bold.underline(result.url)}`);
            console.log(`  ${chalk.cyan('ID:')}          ${result.id}`);
            console.log(`  ${chalk.cyan('Amount:')}      ${result.amount} ${result.currency}`);
            if (name) console.log(`  ${chalk.cyan('Prefilled:')}   ${name} (${phone || email || 'N/A'})`);
            if (result.expiresAt) {
                console.log(`  ${chalk.yellow('Expires:')}     ${new Date(result.expiresAt).toLocaleString()}`);
            }

            if (opts.qr) {
                renderTerminalQR(result.url, `Scan with Phone to Pay (${name || 'Customer'})`);
            }
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

// -------------------------------------------------------------
// 3. Fee Comparison & Smart Router Inspector (Feature 3)
// -------------------------------------------------------------
program
    .command('compare')
    .description('Compare transaction fees and payout across Stripe, Razorpay, and LemonSqueezy')
    .argument('<amount>', 'Amount in minor units', (v) => parseInt(v, 10))
    .option('-c, --currency <currency>', 'Currency code (INR, USD, EUR)', 'INR')
    .action((amount: number, opts: any) => {
        const cur = opts.currency || 'INR';
        const estimates = GatewayRouter.compareFees(amount, cur);

        console.log(chalk.cyan.bold(`\n📊 Fee Breakdown for ${(amount / 100).toFixed(2)} ${cur.toUpperCase()}:\n`));
        console.table(
            estimates.map((e) => ({
                Provider: e.provider.toUpperCase(),
                'Fee Rate': `${e.percentageFee}% + ${(e.fixedFee / 100).toFixed(2)}`,
                'Total Deductions': `${(e.estimatedDeduction / 100).toFixed(2)} ${cur}`,
                'Net Payout': `${(e.netPayout / 100).toFixed(2)} ${cur}`,
                Recommended: e.recommended ? '🌟 BEST' : '—',
                Notes: e.reason,
            }))
        );
    });

// -------------------------------------------------------------
// 4. Synthetic Mock Webhook Trigger (Feature 4)
// -------------------------------------------------------------
program
    .command('trigger')
    .description('Send a synthetic, HMAC-signed webhook event to your local backend')
    .argument('<event>', 'Event name (e.g. payment.captured, payment.failed, refund.processed)')
    .option('-p, --provider <provider>', 'razorpay | stripe', 'razorpay')
    .option('-t, --target <url>', 'Backend target URL', 'http://localhost:3000/api/webhooks')
    .option('-s, --secret <secret>', 'HMAC signing secret', 'my_webhook_secret')
    .option('-a, --amount <amount>', 'Amount in minor units', (v) => parseInt(v, 10), 50000)
    .action(async (event: string, opts: any) => {
        try {
            const res = await WebhookTrigger.sendMockEvent(
                opts.target,
                event,
                opts.provider,
                opts.secret,
                opts.amount
            );
            console.log(chalk.green(`✔ Event delivered! (Response HTTP ${res.status} ${res.statusText})`));
        } catch (err: any) {
            console.log(chalk.red(`✖ Failed to trigger mock webhook: ${err.message}`));
        }
    });

// -------------------------------------------------------------
// 5. Invoicing & Line Items (Feature 6)
// -------------------------------------------------------------
program
    .command('invoice')
    .description('Generate an itemized invoice link with tax calculations')
    .option('-p, --provider <provider>', 'razorpay | stripe', 'razorpay')
    .option('-e, --email <email>', 'Customer email address')
    .option('-c, --currency <currency>', 'Currency code', 'INR')
    .option('--items <items>', 'Item list formatted as "Name:Qty:PriceInMinorUnits,..."')
    .action(async (opts: any) => {
        try {
            let { provider, email, currency, items } = opts;
            if (!email || !items) {
                const answers = await inquirer.prompt([
                    { type: 'input', name: 'email', message: 'Customer email:', when: !email },
                    {
                        type: 'input',
                        name: 'items',
                        message: 'Items (Format: "Item:Qty:MinorPrice", e.g. "Dev:1:350000"):',
                        when: !items,
                    },
                ]);
                email = email || answers.email;
                items = items || answers.items;
            }

            // Parse items
            const parsedItems = items.split(',').map((it: string) => {
                const [name, qty, price] = it.split(':');
                return { name: name.trim(), quantity: parseInt(qty, 10) || 1, unitAmount: parseInt(price, 10) || 0 };
            });

            const totalAmount = parsedItems.reduce((acc: number, it: any) => acc + (it.quantity * it.unitAmount), 0);
            const desc = parsedItems.map((i: any) => `${i.name} (x${i.quantity})`).join(', ');

            const client = getActiveProvider(provider || 'razorpay');
            console.log(chalk.blue(`⏳ Generating invoice link for ${email}...`));

            const result = await client.createPaymentLink({
                amount: totalAmount,
                currency: currency || 'INR',
                description: `Invoice: ${desc}`,
                customerEmail: email,
            });

            console.log(chalk.green.bold('\n✔ Itemized Invoice Generated:'));
            console.log(`  ${chalk.cyan('Total:')}    ${totalAmount} ${currency || 'INR'}`);
            console.log(`  ${chalk.cyan('Items:')}    ${desc}`);
            console.log(`  ${chalk.cyan('Pay URL:')}  ${chalk.bold.underline(result.url)}`);
            renderTerminalQR(result.url, 'Scan to Pay Invoice');
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

// -------------------------------------------------------------
// 6. Analytics & Overview Dashboard (Feature 7)
// -------------------------------------------------------------
program
    .command('stats')
    .description('Display real-time transaction analytics across active gateways')
    .option('-p, --provider <provider>', 'razorpay | stripe | lemonsqueezy', 'razorpay')
    .action(async (opts: any) => {
        try {
            const client = getActiveProvider(opts.provider);
            console.log(chalk.blue(`⏳ Pulling recent analytics from ${opts.provider}...`));
            const txns = await client.listTransactions(50);

            const totalVolume = txns.reduce((acc, t) => acc + t.amount, 0);
            const successful = txns.filter((t) => ['captured', 'paid', 'succeeded'].includes(t.status.toLowerCase()));
            const successVolume = successful.reduce((acc, t) => acc + t.amount, 0);

            console.log(chalk.cyan.bold(`\n📈 Transaction Performance (${opts.provider.toUpperCase()}):\n`));
            console.log(`  ${chalk.gray('Total Processed:')}     ${(totalVolume / 100).toLocaleString()}`);
            console.log(`  ${chalk.green('Captured Revenue:')}    ${(successVolume / 100).toLocaleString()}`);
            console.log(`  ${chalk.yellow('Success Rate:')}        ${txns.length ? ((successful.length / txns.length) * 100).toFixed(1) : 0}%`);
            console.log(`  ${chalk.magenta('Recent Charges:')}     ${txns.length} records retrieved\n`);
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

// -------------------------------------------------------------
// Existing Commands: Transactions, Refunds, and Webhook Listener
// -------------------------------------------------------------
const txn = program.command('txn').description('Inspect transactions');
txn
    .command('list')
    .description('List recent transactions')
    .option('-p, --provider <provider>', 'stripe | razorpay | lemonsqueezy', 'razorpay')
    .option('-l, --limit <limit>', 'Number of transactions', (v) => parseInt(v, 10), 10)
    .action(async (opts: any) => {
        try {
            const client = getActiveProvider(opts.provider);
            const txns = await client.listTransactions(opts.limit);
            console.table(txns.map(t => ({ ID: t.id, Amount: t.amount, Currency: t.currency, Status: t.status, Created: t.createdAt })));
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

const refund = program.command('refund').description('Manage refunds');
refund
    .command('create <paymentId>')
    .description('Issue a refund')
    .option('-p, --provider <provider>', 'stripe | razorpay', 'razorpay')
    .option('-a, --amount <amount>', 'Amount in minor units', (v) => parseInt(v, 10))
    .action(async (paymentId: string, opts: any) => {
        try {
            const client = getActiveProvider(opts.provider);
            const res = await client.createRefund({ paymentId, amount: opts.amount });
            console.log(chalk.green(`✔ Refund issued: ${res.id} (${res.status})`));
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

program
    .command('listen')
    .description('Start local webhook server with HMAC verification and backend forwarding')
    .option('-p, --port <port>', 'Port to bind', (val) => parseInt(val, 10), 4242)
    .option('-f, --forward <url>', 'Backend target URL to forward webhooks')
    .option('-s, --secret <secret>', 'Signing secret for HMAC verification')
    .action((opts: any) => {
        const port = Number(opts.port) || 4242;
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', async () => {
                const time = new Date().toLocaleTimeString();
                console.log(chalk.bold.magenta(`\n[${time}] Received Webhook on ${req.url}`));

                if (opts.secret) {
                    const rzpSig = req.headers['x-razorpay-signature'] as string;
                    const stripeSig = req.headers['stripe-signature'] as string;
                    let isValid = false;
                    if (rzpSig) isValid = WebhookVerifier.verifyRazorpaySignature(body, rzpSig, opts.secret);
                    else if (stripeSig) isValid = WebhookVerifier.verifyStripeSignature(body, stripeSig, opts.secret);

                    if (!isValid) {
                        console.log(chalk.red.bold('✖ Signature verification FAILED. Dropping untrusted payload.'));
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid signature' }));
                        return;
                    }
                    console.log(chalk.green('✔ Webhook signature verified successfully (Authentic).'));
                }

                try {
                    console.log(chalk.green(JSON.stringify(JSON.parse(body), null, 2)));
                } catch {
                    console.log(chalk.gray(body));
                }

                if (opts.forward) {
                    try {
                        console.log(chalk.blue(`⏳ Forwarding to ${opts.forward}...`));
                        await fetch(opts.forward, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body,
                        });
                        console.log(chalk.green(`✔ Forwarded successfully!`));
                    } catch (e: any) {
                        console.log(chalk.red(`✖ Failed to forward: ${e.message}`));
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ received: true }));
            });
        });

        server.listen(port, () => {
            console.log(chalk.cyan.bold(`\n⚡ Webhook listener running at http://localhost:${port}/`));
            if (opts.secret) console.log(chalk.green(`🔒 Signature verification enabled`));
            if (opts.forward) console.log(chalk.yellow(`🔁 Forwarding target: ${opts.forward}`));
            console.log(chalk.gray('Waiting for events... (Ctrl+C to quit)\n'));
        });
    });

program.parse(process.argv);