# 💳 unified-pay-cli

[![npm version](https://img.shields.io/npm/v/unified-pay-cli.svg)](https://www.npmjs.com/package/unified-pay-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Protocol](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

Universal multi-provider payment CLI & Model Context Protocol (MCP) server for Stripe and Razorpay.

## ⚡ Quick Start

```bash
# Set credentials
npx unified-pay-cli config --stripe-key sk_test_xxx
npx unified-pay-cli config --razorpay-id rzp_test_xxx --razorpay-secret xxx

# Interactive payment link creation
npx unified-pay-cli link

# List transactions
npx unified-pay-cli txn list --provider razorpay --limit 5

# Issue refund
npx unified-pay-cli refund pay_xxx --provider razorpay --amount 50000

# Listen to webhooks locally
npx unified-pay-cli listen --port 4242