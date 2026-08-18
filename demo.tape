Output assets/demo.gif

Set FontSize 16
Set Width 960
Set Height 580
Set Padding 20
Set Theme "TokyoNight"

# 1. Show Help & Providers
Type "pay --help"
Enter
Sleep 2s

# 2. Configure Gateway Credentials
Type "pay config --razorpay-id rzp_test_TROQOJsbj9DlSN --razorpay-secret XLTEqtkKAkoO0rMSh22eYUSc"
Enter
Sleep 1.5s

# 3. Create a Payment Link (Interactive Mode)
Type "pay link"
Enter
Sleep 1s

# Select Razorpay
Down
Sleep 400ms
Enter

# Amount (350000 = ₹3,500)
Type "350000"
Enter
Sleep 400ms

# Currency default (INR)
Enter
Sleep 400ms

# Description
Type "Full-Stack System Architecture Consultation"
Enter
Sleep 2.5s

# 4. List Recent Transactions
Type "pay txn list --provider razorpay --limit 2"
Enter
Sleep 2.5s

# 5. Process a Partial Refund
Type "pay refund create pay_Oq7Jk8LmNx9 --provider razorpay --amount 50000"
Enter
Sleep 2.5s

# 6. Check Refund Status
Type "pay refund status rfnd_TRNTRFvhQ6NDKx --provider razorpay"
Enter
Sleep 2.5s

# 7. Start Webhook Listener with HMAC-SHA256 Verification & Forwarding
Type "pay listen --port 4242 --secret my_webhook_secret --forward http://localhost:3000/api/webhooks"
Enter
Sleep 3s