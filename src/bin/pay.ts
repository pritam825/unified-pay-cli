#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { configStore } from '../config/store.js';
import { StripeAdapter } from '../providers/stripe.js';
import { RazorpayAdapter } from '../providers/razorpay.js';
import { startMCPServer } from '../mcp/server.js';

const program = new Command();

program
  .name('pay')
  .description('Unified Payment Gateway CLI & MCP Bridge')
  .version('0.1.0');

// -------------------------------------------------------------
// 1. 'config' COMMAND
// -------------------------------------------------------------
program
  .command('config')
  .description('Set credentials for payment providers')
  .option('--stripe-key <key>', 'Stripe API Secret Key')
  .option('--razorpay-id <id>', 'Razorpay Key ID')
  .option('--razorpay-secret <secret>', 'Razorpay Key Secret')
  .action((opts: any) => {
    const keysSet: string[] = [];

    if (opts.stripeKey) {
      configStore.set('stripeApiKey', opts.stripeKey);
      keysSet.push('Stripe Key');
    }
    if (opts.razorpayId) {
      configStore.set('razorpayKeyId', opts.razorpayId);
      keysSet.push('Razorpay Key ID');
    }
    if (opts.razorpaySecret) {
      configStore.set('razorpayKeySecret', opts.razorpaySecret);
      keysSet.push('Razorpay Key Secret');
    }

    if (keysSet.length === 0) {
      console.log(chalk.yellow('No keys provided. Pass flags like --stripe-key <key>'));
      return;
    }

    console.log(chalk.green(`✔ Saved configuration for: ${keysSet.join(', ')}`));
  });

// -------------------------------------------------------------
// 2. 'link' COMMAND (Interactive fallback + CLI flags)
// -------------------------------------------------------------
program
  .command('link')
  .description('Create a quick payment link')
  .option('-p, --provider <provider>', 'Provider (stripe or razorpay)')
  .option('-a, --amount <amount>', 'Amount in minor units (cents/paise)', parseInt)
  .option('-c, --currency <currency>', 'Currency code')
  .option('-d, --desc <description>', 'Payment description')
  .action(async (opts: any) => {
    let { provider, amount, currency, desc } = opts;

    // Interactive fallback if flags are omitted
    if (!provider || !amount || !desc) {
      const answers = await inquirer.prompt([
        {
        type: 'select',
        name: 'provider',
        message: 'Select payment provider:',
        choices: [
            { name: 'stripe', value: 'stripe' },
            { name: 'razorpay', value: 'razorpay' }
        ],
        when: !provider,
        },
        {
          type: 'number',
          name: 'amount',
          message: 'Enter amount in smallest unit (e.g., 500 = $5 or ₹5):',
          when: !amount,
          validate: (val) => (val && val > 0 ? true : 'Amount must be greater than 0'),
        },
        {
          type: 'input',
          name: 'currency',
          message: 'Currency (e.g., USD, INR):',
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
      let adapter;
      if (provider === 'stripe') {
        const key = configStore.get('stripeApiKey') as string;
        if (!key) throw new Error('Stripe API Key missing. Run: pay config --stripe-key <key>');
        adapter = new StripeAdapter(key);
      } else if (provider === 'razorpay') {
        const id = configStore.get('razorpayKeyId') as string;
        const secret = configStore.get('razorpayKeySecret') as string;
        if (!id || !secret) throw new Error('Razorpay keys missing. Run: pay config --razorpay-id <id> --razorpay-secret <secret>');
        adapter = new RazorpayAdapter(id, secret);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      const result = await adapter.createPaymentLink({
        amount,
        currency: currency || (provider === 'razorpay' ? 'INR' : 'USD'),
        description: desc,
      });

      spinner.succeed(chalk.bold('Payment link generated!'));
      console.log(chalk.cyan(`\nURL: ${result.url}`));
      console.log(chalk.gray(`ID:  ${result.id}`));
    } catch (err: any) {
      const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
      spinner.fail(chalk.red(`Error: ${msg}`));
    }
  });

// -------------------------------------------------------------
// 3. 'txn' COMMAND GROUP
// -------------------------------------------------------------
const txn = program.command('txn').description('Manage and inspect transactions');

txn
  .command('list')
  .description('List recent transactions')
  .requiredOption('-p, --provider <provider>', 'Provider (stripe or razorpay)')
  .option('-l, --limit <number>', 'Number of transactions to fetch', parseInt, 5)
  .action(async (opts: any) => {
    const spinner = ora(`Fetching ${opts.provider} transactions...`).start();
    try {
      let adapter;
      if (opts.provider === 'stripe') {
        const key = configStore.get('stripeApiKey') as string;
        if (!key) throw new Error('Stripe API Key missing. Run: pay config --stripe-key <key>');
        adapter = new StripeAdapter(key);
      } else if (opts.provider === 'razorpay') {
        const id = configStore.get('razorpayKeyId') as string;
        const secret = configStore.get('razorpayKeySecret') as string;
        if (!id || !secret) throw new Error('Razorpay keys missing. Run: pay config --razorpay-id <id> --razorpay-secret <secret>');
        adapter = new RazorpayAdapter(id, secret);
      } else {
        throw new Error(`Unsupported provider: ${opts.provider}`);
      }

      const txns = await adapter.listTransactions(opts.limit);
      spinner.stop();

      if (!txns || txns.length === 0) {
        console.log(chalk.yellow('No recent transactions found.'));
        return;
      }

      console.table(txns);
    } catch (err: any) {
      const msg = err?.description || err?.error?.description || err?.message || JSON.stringify(err);
      spinner.fail(chalk.red(`Error: ${msg}`));
    }
  });

// -------------------------------------------------------------
// 4. 'mcp' COMMAND
// -------------------------------------------------------------
program
  .command('mcp')
  .description('Start Model Context Protocol stdio server')
  .action(() => {
    startMCPServer();
  });

program.parse(process.argv);