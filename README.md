<div align="center">

# 💳 unified-pay-cli

**The Universal Payment Gateway CLI & Model Context Protocol (MCP) Server for Stripe, Razorpay & LemonSqueezy.**

[![npm version](https://img.shields.io/npm/v/unified-pay-cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/unified-pay-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![MCP Protocol](https://img.shields.io/badge/MCP-Compatible-8A2BE2.svg?style=flat-square)](https://modelcontextprotocol.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

<p align="center">
  Create checkout links interactively, query live transactions, track and issue refunds, stream & forward webhook payloads with cryptographic signature verification - or let AI agents manage payment workflows autonomously over MCP.
</p>

<!-- DEMO PREVIEW -->
<p align="center">
  <img src="./assets/demo.gif" alt="unified-pay demo" width="750px" />
</p>

</div>

---

## 🚀 Highlights

- ⚡ **Zero Installation Required:** Run instantly on demand via `npx unified-pay-cli`.
- 🎯 **Multi-Provider Engine:** Standardized interface across **Stripe**, **Razorpay**, and **LemonSqueezy**.
- 🛠️ **Smart Payment Link Generation:** Interactive terminal UI prompts or direct scripted CLI flags.
- 🔄 **Full Transaction & Refund Lifecycle:** Live status checks, recent transaction listings, partial/full refunds, and dedicated refund progress tracking.
- 📡 **Webhook Station & Forwarding Proxy:** Built-in HTTP listener (`pay listen`) that intercepts, color-codes, and forwards webhook events directly to your local backend (`--forward http://localhost:3000/api/webhooks`).
- 🔒 **Cryptographic Signature Verification:** Built-in HMAC-SHA256 verification (`--secret`) protecting your local development from forged or tampered webhook payloads.
- 🤖 **Native Model Context Protocol (MCP):** Connect your payment stack to GitHub Copilot, Cursor, or Claude Desktop so AI can create links, verify signatures, and track invoices from natural language prompts.

---

## ⚡ Quick Start

### 1. Installation

Install globally or run on demand via `npx`:

```bash
# Global install (recommended for daily CLI use)
npm install -g unified-pay-cli

# Or run instantly with npx
npx unified-pay-cli --help
```

### 2. Configure Credentials

```bash
# Stripe
pay config --stripe-key sk_test_51...

# Razorpay
pay config --razorpay-id rzp_test_... --razorpay-secret ...

# LemonSqueezy (Optional)
pay config --lemonsqueezy-key lms_... --lemonsqueezy-store 12345
```

---

## 💻 CLI Command Reference

### 1. Create Payment Links (`pay link`)

```bash
# Interactive mode (prompts for provider, amount, description)
pay link

# Scriptable flag mode
pay link --provider razorpay --amount 350000 --currency INR --desc "2-Hour Technical Consultation"
pay link --provider stripe --amount 2500 --currency USD --desc "Pro Tier Subscription"
```

### 2. Inspect Transactions (`pay txn`)

```bash
# List recent transactions
pay txn list --provider razorpay --limit 5

# Check specific payment details
pay txn status pay_Oq7Jk8LmNx9 --provider razorpay
```

### 3. Issue & Track Refunds (`pay refund`)

`pay` handles the separate lifecycle of charges vs. refund entities:

```bash
# Issue a refund (full or partial in minor units)
pay refund create pay_Oq7Jk8LmNx9 --provider razorpay --amount 10000

# Track live refund progression
pay refund status rfnd_TRNTRFvhQ6NDKx --provider razorpay

# List all past refunds
pay refund list --provider razorpay
```

### 4. Webhook Station, Verification & Proxy (`pay listen`)

Catch real-time webhook events during local development without complex tunneling setups:

```bash
# 1. Basic listener
pay listen --port 4242

# 2. Listener with HMAC-SHA256 signature verification
pay listen --port 4242 --secret my_webhook_signing_secret

# 3. Listener with signature verification + proxy forwarding to local backend
pay listen --port 4242 --secret my_webhook_secret --forward http://localhost:3000/api/webhooks
```

---

## 🤖 Model Context Protocol (MCP) Integration

Turn your AI assistant into an autonomous billing and payment operator.

### 1. Add to VS Code / GitHub Copilot (`.vscode/mcp.json`)

```json
{
  "mcpServers": {
    "unified-pay": {
      "command": "npx",
      "args": ["-y", "unified-pay-cli", "mcp"]
    }
  }
}
```

### 2. Available AI Tools

| Tool Name | Description |
| --- | --- |
| create_payment_link | Creates checkout URLs with custom amount, currency, and note. |
| list_transactions | Fetches recent charges and verification statuses. |
| get_payment_status | Inspects lifecycle state for a specific payment ID (pay_xxx, ch_xxx). |
| create_refund | Triggers a full or partial refund. |
| get_refund_status | Tracks the live status of a refund ID (rfnd_xxx, re_xxx). |
| list_refunds | Lists historical refund records. |
| verify_webhook_signature | Verifies HMAC-SHA256 authenticity of incoming Stripe/Razorpay payloads. |

### 3. Example AI Prompts

```text
Use unified-pay to generate a INR 3,500 Razorpay payment link for "2-Hour Technical Consultation" and draft a WhatsApp message for the client.
Check if payment ID pay_Oq7Jk8LmNx9 on Razorpay was successfully captured.
Issue a full refund for Stripe charge ch_3Mtw1234 using unified-pay.
Verify if this incoming Razorpay webhook payload and signature are authentic using my signing secret.
```

---

## 🧪 Testing & Verification

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 🛠️ Development

```bash
# 1. Clone the repository
git clone https://github.com/your-username/unified-pay-cli.git
cd unified-pay-cli

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Symlink globally for local testing
npm link
```

## 📄 License

Distributed under the MIT License. See LICENSE for details.
