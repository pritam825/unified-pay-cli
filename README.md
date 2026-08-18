<div align="center">

# 💳 unified-pay-cli

**The Universal Payment Gateway CLI & Model Context Protocol (MCP) Server for Stripe & Razorpay.**

[![npm version](https://img.shields.io/npm/v/unified-pay-cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/unified-pay-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![MCP Protocol](https://img.shields.io/badge/MCP-Compatible-8A2BE2.svg?style=flat-square)](https://modelcontextprotocol.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

<p align="center">
  Create payment links interactively, inspect live charges, process refunds, and stream gateway webhooks directly to your terminal — or let AI agents (Copilot, Cursor, Claude) manage payments autonomously over MCP.
</p>

<!-- DEMO PREVIEW -->
<p align="center">
  <img src="./assets/demo.gif" alt="unified-pay demo" width="750px" />
</p>

</div>

---

## 🚀 Key Features

- ⚡ **Zero Setup Friction:** Run instantly via `npx unified-pay-cli` without cloning.
- 🎯 **Multi-Gateway Engine:** Standardized interface for **Stripe** and **Razorpay**.
- 🛠️ **Dual-Mode Link Creation:** Interactive terminal prompts or scriptable CLI flags.
- 🔄 **Full Transaction & Refund Lifecycle:** Query charges, verify payments, and trigger full/partial refunds with live status auto-routing.
- 📡 **Local Webhook Emulator:** Built-in listener (`pay listen`) to catch and inspect live gateway events.
- 🤖 **Native Model Context Protocol (MCP):** Connect your payment stack to GitHub Copilot, Cursor, or Claude Desktop so AI can create links and track invoices from plain text prompts.

---

## ⚡ Quick Start

### 1. Global Setup / Zero-Install
You can install globally or execute directly via `npx`:

```bash
# Global installation (optional)
npm install -g unified-pay-cli

# Or run on demand
npx unified-pay-cli --help