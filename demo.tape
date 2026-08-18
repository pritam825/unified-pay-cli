Output assets/demo.gif

Set FontSize 18
Set Width 900
Set Height 520
Set Padding 20
Set Theme "TokyoNight"

Type "pay link"
Enter
Sleep 1.5s

# Select Razorpay
Down
Sleep 500ms
Enter

# Enter amount (₹3,500 = 350000 paise)
Type "350000"
Enter
Sleep 500ms

# Currency default (INR)
Enter
Sleep 500ms

# Payment description
Type "Technical Consultation - 2hr session"
Enter
Sleep 3s

# List recent transactions
Type "pay txn list --provider razorpay --limit 3"
Enter
Sleep 3s