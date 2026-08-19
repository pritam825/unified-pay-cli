#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import http from 'http';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { LemonSqueezyAdapter } from '../providers/lemonsqueezy.js';
import { CashfreeAdapter } from '../providers/cashfree.js';
import { UPIAdapter } from '../providers/upi.js';
import { WebhookVerifier } from '../crypto/WebhookVerifier.js';
import { renderTerminalQR } from '../utils/qr.js';
import { GatewayRouter } from '../utils/router.js';
import { WebhookTrigger } from '../utils/trigger.js';
import { ProfileManager } from '../utils/profiles.js';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';
import { PaymentProviderType } from '../types/PaymentProviderType.js';

const program = new Command();
const profileManager = new ProfileManager();

// Update getActiveProvider to accept an optional custom VPA override:
function getActiveProvider(providerName: PaymentProviderType, customVpa?: string): PaymentProvider {
    const activeProfile = profileManager.getProfile();

    if (providerName === 'upi') {
        const vpa = (customVpa || activeProfile.upiVpa || process.env.UPI_VPA)?.trim();
        const name = activeProfile.upiName || process.env.UPI_NAME || 'Merchant';
        if (!vpa) {
            throw new Error(`UPI VPA missing. Provide via '--vpa <id>' or set default via: pay config --upi-vpa <your_vpa@bank>`);
        }
        return new UPIAdapter(vpa, name);
    }

    if (providerName === 'cashfree') {
        const appId = activeProfile.cashfreeAppId || process.env.CASHFREE_APP_ID;
        const secretKey = activeProfile.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY;
        if (!appId || !secretKey) throw new Error(`Cashfree keys missing. Set via: pay config --cashfree-app-id <appId> --cashfree-secret <sec>`);
        return new CashfreeAdapter(appId, secretKey, false);
    }

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
    .description('Universal Payment Gateway CLI & MCP Engine (UPI, Cashfree, Razorpay, Stripe, LemonSqueezy)')
    .version('0.1.3');

// -------------------------------------------------------------
// 1. Config & Profile Switching
// -------------------------------------------------------------
program
    .command('config')
    .description('Set credentials for active profile')
    .option('--upi-vpa <vpa>', 'UPI ID / VPA (e.g. yourname@okaxis)')
    .option('--upi-name <name>', 'Payee Display Name for UPI')
    .option('--cashfree-app-id <appId>', 'Cashfree App ID')
    .option('--cashfree-secret <secret>', 'Cashfree Secret Key')
    .option('--stripe-key <key>', 'Stripe Secret Key')
    .option('--razorpay-id <id>', 'Razorpay Key ID')
    .option('--razorpay-secret <secret>', 'Razorpay Key Secret')
    .option('--lemonsqueezy-key <key>', 'LemonSqueezy API Key')
    .option('--lemonsqueezy-store <storeId>', 'LemonSqueezy Store ID')
    .action((opts: any) => {
        const active = profileManager.getActiveProfileName();
        profileManager.saveProfile(active, {
            upiVpa: opts.upiVpa,
            upiName: opts.upiName,
            cashfreeAppId: opts.cashfreeAppId,
            cashfreeSecretKey: opts.cashfreeSecret,
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
// 2. Payment Link with QR Code, Expiry & Smart Routing
// -------------------------------------------------------------
program
    .command('link')
    .description('Create a payment link or UPI QR code')
    .option('-p, --provider <provider>', 'Payment provider (upi, cashfree, razorpay, stripe, lemonsqueezy)', 'upi')
    .option('-a, --amount <amount>', 'Amount in minor units (paise/cents, e.g. 100000 = ₹1,000)', parseInt)
    .option('-c, --currency <currency>', 'Currency code (e.g. INR, USD)', 'INR')
    .option('-d, --description <description>', 'Payment description / memo')
    .option('--desc <desc>', 'Alias for description')
    .option('--vpa <vpa>', 'Custom UPI ID / VPA for this transaction (e.g. name@okaxis)')
    .option('--name <name>', 'Customer name')
    .option('--phone <phone>', 'Customer phone number')
    .option('--email <email>', 'Customer email address')
    .option('--expire <minutes>', 'Expiry in minutes', parseInt)
    .option('--qr', 'Force render terminal QR code')
    .option('--smart', 'Auto-route to optimal provider')
    .action(async (opts: any) => {
        try {
            let provider = opts.provider;
            let amount = opts.amount;
            let currency = opts.currency || 'INR';
            let desc = opts.description || opts.desc;
            let vpa = opts.vpa;
            let name = opts.name;
            let email = opts.email;
            let phone = opts.phone;
            let expire = opts.expire;

            const activeProfile = profileManager.getProfile();

            if (opts.smart && currency && amount) {
                provider = GatewayRouter.recommendProvider(currency, amount);
            }

            // If using UPI and no VPA is provided or saved, prompt interactively
            if (provider === 'upi' && !vpa && !activeProfile.upiVpa) {
                const vpaAnswer = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'vpa',
                        message: 'Enter your UPI ID / VPA (e.g. username@okhdfcbank):',
                        validate: (input) => (input.includes('@') ? true : 'Please enter a valid UPI ID with "@"'),
                    },
                ]);
                vpa = vpaAnswer.vpa.trim();
            }

            // Interactive prompts for remaining missing fields
            if (!amount || !desc) {
                const answers = await inquirer.prompt([
                    {
                        type: 'number',
                        name: 'amount',
                        message: 'Enter amount in smallest unit (e.g. 150000 = ₹1,500):',
                        when: !amount,
                    },
                    {
                        type: 'input',
                        name: 'desc',
                        message: 'Payment description:',
                        default: 'Consultation',
                        when: !desc,
                    },
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Customer Name (optional):',
                        when: !name,
                    },
                ]);

                amount = amount || answers.amount;
                desc = desc || answers.desc;
                name = name || answers.name;
            }

            // Prompt to save as default if VPA is new or different from stored
            if (provider === 'upi' && vpa && vpa !== activeProfile.upiVpa) {
                const { saveDefault } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'saveDefault',
                        message: `Would you like to set '${vpa}' as your default UPI ID?`,
                        default: true,
                    },
                ]);
                if (saveDefault) {
                    profileManager.updateProfile({ upiVpa: vpa });
                    console.log(chalk.green(`✔ Saved '${vpa}' as default UPI ID.`));
                }
            }

            const client = getActiveProvider(provider, vpa);
            console.log(chalk.blue(`⏳ Generating checkout link / QR on ${chalk.bold(provider)}...`));

            const result = await client.createPaymentLink({
                amount,
                currency,
                description: desc,
                customerName: name || undefined,
                customerPhone: phone || undefined,
                customerEmail: email || undefined,
                expiresInMinutes: expire > 0 ? expire : undefined,
            });

            console.log(chalk.green.bold('\n✔ Payment Link / UPI Intent Created:'));
            console.log(`  ${chalk.cyan('URL / Intent:')}  ${chalk.bold.underline(result.url)}`);
            console.log(`  ${chalk.cyan('ID:')}            ${result.id}`);
            console.log(`  ${chalk.cyan('Amount:')}        ${(result.amount / 100).toFixed(2)} ${result.currency}`);
            if (name) console.log(`  ${chalk.cyan('Customer:')}      ${name} (${phone || email || 'N/A'})`);
            if (result.expiresAt) {
                console.log(`  ${chalk.yellow('Expires:')}       ${new Date(result.expiresAt).toLocaleString()}`);
            }

            if (provider === 'upi' || opts.qr) {
                console.log();
                if (result.qrCodeAscii) {
                    console.log(result.qrCodeAscii);
                } else {
                    renderTerminalQR(result.url, 'Scan with GPay / PhonePe / Paytm / CRED to Pay');
                }
            }
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

// -------------------------------------------------------------
// 3. Fee Comparison & Smart Router Inspector
// -------------------------------------------------------------
program
    .command('compare')
    .description('Compare transaction fees and payout across Gateways')
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
// 4. Synthetic Mock Webhook Trigger
// -------------------------------------------------------------
program
    .command('trigger')
    .description('Send a synthetic, HMAC-signed webhook event to your local backend')
    .argument('<event>', 'Event name (e.g. payment.captured, payment.failed, refund.processed)')
    .option('-p, --provider <provider>', 'razorpay | stripe | cashfree', 'razorpay')
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
// 5. Invoicing & Line Items
// -------------------------------------------------------------
program
    .command('invoice')
    .description('Generate an itemized invoice link with tax calculations')
    .option('-p, --provider <provider>', 'upi | cashfree | razorpay | stripe', 'upi')
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

            const parsedItems = items.split(',').map((it: string) => {
                const [name, qty, price] = it.split(':');
                return { name: name.trim(), quantity: parseInt(qty, 10) || 1, unitAmount: parseInt(price, 10) || 0 };
            });

            const totalAmount = parsedItems.reduce((acc: number, it: any) => acc + (it.quantity * it.unitAmount), 0);
            const desc = parsedItems.map((i: any) => `${i.name} (x${i.quantity})`).join(', ');

            const client = getActiveProvider(provider || 'upi');
            console.log(chalk.blue(`⏳ Generating invoice link for ${email}...`));

            const result = await client.createPaymentLink({
                amount: totalAmount,
                currency: currency || 'INR',
                description: `Invoice: ${desc}`,
                customerEmail: email,
            });

            console.log(chalk.green.bold('\n✔ Itemized Invoice Generated:'));
            console.log(`  ${chalk.cyan('Total:')}    ${(totalAmount / 100).toFixed(2)} ${currency || 'INR'}`);
            console.log(`  ${chalk.cyan('Items:')}    ${desc}`);
            console.log(`  ${chalk.cyan('Pay URL:')}  ${chalk.bold.underline(result.url)}`);
            
            if (provider === 'upi') {
                if (result.qrCodeAscii) console.log(result.qrCodeAscii);
                else renderTerminalQR(result.url, 'Scan to Pay Invoice');
            }
        } catch (err: any) {
            console.log(chalk.red(`✖ Error: ${err.message}`));
        }
    });

// -------------------------------------------------------------
// 6. Analytics & Overview Dashboard
// -------------------------------------------------------------
program
    .command('stats')
    .description('Display real-time transaction analytics across active gateways')
    .option('-p, --provider <provider>', 'razorpay | stripe | lemonsqueezy | cashfree', 'razorpay')
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
    .option('-p, --provider <provider>', 'stripe | razorpay | lemonsqueezy | cashfree', 'razorpay')
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
    .option('-p, --provider <provider>', 'stripe | razorpay | cashfree', 'razorpay')
    .option('-a, --amount <amount>', 'Amount in minor units', (v) => parseInt(v, 10))
    .action(async (paymentId: string, opts: any) => {
        try {
            const client = getActiveProvider(opts.provider);
            const res = await client.createRefund({ paymentId, amount: opts.amount });
            console.log(chalk.green(`✔ Refund issued: ${res.id || paymentId}`));
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