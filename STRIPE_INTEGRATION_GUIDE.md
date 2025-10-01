# Stripe Payment Integration Guide for Wyng Lite

## ✅ Current Implementation Status

Your Wyng Lite application has a **complete Stripe payment implementation** ready to accept payments. The following components are already in place:

### Implemented Components:
1. **Donation API** (`/api/donate`) - Creates Stripe Checkout sessions
2. **Webhook Handler** (`/api/stripe-webhook`) - Processes payment confirmations
3. **Thank You Page** (`/thank-you`) - Post-payment confirmation page
4. **Database Schema** - `donations` and `leads` tables in Supabase

## 🔑 Required Configuration

To activate Stripe payments, you need to configure the following environment variables:

### 1. Local Development (.env.local)
```bash
# Stripe Test Keys (from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# Your local development URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Production Environment (Vercel)
```bash
# Stripe Live Keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# Your production URL
NEXT_PUBLIC_SITE_URL=https://wyng-lite.vercel.app
```

## 📋 Step-by-Step Setup Instructions

### Step 1: Get Your Stripe API Keys

1. **Sign up/Login** to Stripe: https://dashboard.stripe.com
2. **Test Mode Keys** (for development):
   - Go to Developers → API keys
   - Toggle to "Test mode" (top right)
   - Copy your `Secret key` (starts with `sk_test_`)

3. **Live Mode Keys** (for production):
   - Toggle to "Live mode"
   - Copy your `Secret key` (starts with `sk_live_`)

### Step 2: Set Up Webhook Endpoint

1. **In Stripe Dashboard**:
   - Go to Developers → Webhooks
   - Click "Add endpoint"

2. **For Development**:
   - Use Stripe CLI for local testing:
   ```bash
   # Install Stripe CLI
   brew install stripe/stripe-cli/stripe

   # Login to Stripe
   stripe login

   # Forward webhooks to local server
   stripe listen --forward-to localhost:3000/api/stripe-webhook
   ```
   - Copy the webhook secret (starts with `whsec_`)

3. **For Production**:
   - Endpoint URL: `https://your-domain.vercel.app/api/stripe-webhook`
   - Select events:
     - `checkout.session.completed` ✅
     - `checkout.session.expired`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
   - Copy the signing secret (starts with `whsec_`)

### Step 3: Configure Vercel Environment Variables

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project** (wyng-lite)
3. **Go to Settings → Environment Variables**
4. **Add the following**:

```bash
# Required for Stripe
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
NEXT_PUBLIC_SITE_URL=https://wyng-lite.vercel.app

# Already configured (verify these exist)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-key
```

### Step 4: Test the Integration

#### Local Testing:
```bash
# 1. Set up .env.local with test keys
# 2. Run the application
npm run dev

# 3. In another terminal, forward webhooks
stripe listen --forward-to localhost:3000/api/stripe-webhook

# 4. Test donation flow
# Navigate to http://localhost:3000/chat
# Try making a test donation
```

#### Test Card Numbers:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **3D Secure**: 4000 0025 0000 3155

### Step 5: Deploy to Production

```bash
# Commit webhook handler
git add -A
git commit -m "Add Stripe webhook handler for payment processing"
git push origin main

# Deploy to Vercel
vercel --prod
```

## 💳 Payment Flow

1. **User initiates donation** from chat interface
2. **API creates Checkout session** (`/api/donate`)
3. **User redirected to Stripe Checkout**
4. **Payment processed by Stripe**
5. **Webhook receives confirmation** (`/api/stripe-webhook`)
6. **Database updated** (donation marked as completed)
7. **User redirected to thank-you page**

## 🔍 Monitoring & Testing

### Verify Webhook is Working:
```bash
# Check webhook events in Stripe Dashboard
# Developers → Webhooks → [Your endpoint] → Webhook attempts
```

### Check Database Records:
```sql
-- In Supabase SQL Editor
SELECT * FROM donations ORDER BY created_at DESC LIMIT 10;
SELECT * FROM leads WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 10;
```

### Monitor Logs in Vercel:
```bash
# View real-time logs
vercel logs --follow

# Or check in Vercel Dashboard
# Functions → api/donate → Logs
```

## 🚀 Quick Test URLs

Once configured, test these endpoints:

### Development:
- Donation Page: http://localhost:3000/chat
- Direct Donation: http://localhost:3000/api/donate?amount=5
- Thank You: http://localhost:3000/thank-you

### Production:
- Donation Page: https://wyng-lite.vercel.app/chat
- Direct Donation: https://wyng-lite.vercel.app/api/donate?amount=5
- Thank You: https://wyng-lite.vercel.app/thank-you

## 📊 Stripe Dashboard Features to Enable

1. **Customer Portal** (optional):
   - Settings → Billing → Customer portal
   - Enable for donation management

2. **Email Receipts**:
   - Settings → Emails
   - Enable "Successful payments" receipts

3. **Fraud Prevention**:
   - Settings → Radar
   - Enable basic fraud rules

## 🔒 Security Checklist

- [ ] Use environment variables (never commit keys)
- [ ] Verify webhook signatures in production
- [ ] Enable HTTPS for all endpoints
- [ ] Test with Stripe test mode first
- [ ] Monitor failed payment attempts
- [ ] Set up Stripe Radar for fraud prevention

## 🆘 Troubleshooting

### "Missing STRIPE_SECRET_KEY" Error:
- Ensure environment variable is set in Vercel
- Redeploy after adding environment variables

### Webhook Not Receiving Events:
- Check endpoint URL is correct
- Verify webhook secret matches
- Check Stripe Dashboard for failed attempts

### Payment Not Updating Database:
- Check Supabase connection
- Verify donations table exists
- Check webhook logs in Vercel

## 📝 Next Steps

1. **Configure Stripe Tax** (if needed):
   - Dashboard → Products → Tax
   - Set up tax collection rules

2. **Set Up Recurring Donations** (optional):
   - Modify checkout to support subscriptions
   - Add subscription management

3. **Add Payment Methods**:
   - Enable Apple Pay, Google Pay
   - Add alternative payment methods

## Support & Resources

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Support**: https://support.stripe.com
- **Test Card Numbers**: https://stripe.com/docs/testing
- **Webhook Events**: https://stripe.com/docs/webhooks/stripe-events

## Current Implementation Files

- `/src/app/api/donate/route.ts` - Donation API endpoint
- `/src/app/api/stripe-webhook/route.ts` - Webhook handler
- `/src/app/thank-you/page.tsx` - Thank you page
- `/src/lib/validations.ts` - Input validation schemas
- `/supabase/schema.sql` - Database schema