Output assets/demo.gif

Set FontSize 14
Set Width 1000
Set Height 650
Set Padding 20
Set Theme "TokyoNight"

# 1. Overview & Available Commands
Type "pay --help"
Enter
Sleep 1.5s

# 2. Configure Credentials (Live Test Keys)
Type "pay config --razorpay-id rzp_test_TROQOJsbj9DlSN --razorpay-secret XLTEqtkKAkoO0rMSh22eYUSc"
Enter
Sleep 1.2s

# 3. [Feature: Fee Comparison & Smart Routing] Compare rates across gateways
Type "pay compare 350000 --currency INR"
Enter
Sleep 2.5s

# 4. [Features: Prefill, 15m Expiry & Terminal QR] Generate smart expiring link
Type "pay link --provider razorpay --amount 350000 --currency INR --desc 'Architecture Review' --name 'Rahul Sharma' --phone '+919876543210' --expire 15"
Enter
Sleep 3.5s

# 5. [Feature: Invoicing] Generate itemized breakdown invoice
Type "pay invoice --provider razorpay --email client@acme.corp --items 'SystemDesign:1:300000,Consultation:1:50000'"
Enter
Sleep 2.5s

# 6. [Feature: Multi-Profile Switcher] Inspect environment profiles
Type "pay profile list"
Enter
Sleep 1.5s

# 7. [Feature: Analytics] Inspect real-time transaction performance
Type "pay stats --provider razorpay"
Enter
Sleep 2.5s

# 8. [Feature: Synthetic Webhook Trigger] Fire mock HMAC-signed event
Type "pay trigger payment.captured --provider razorpay --target http://localhost:4242/webhooks/razorpay --secret whsec_test"
Enter
Sleep 2.5s

# 9. [Feature: Webhook Listener] Start local verification proxy station
Type "pay listen --port 4242 --secret whsec_test --forward http://localhost:3000/api/webhooks"
Enter
Sleep 3s