# Payment Integration Guide - Paddle

This guide covers setting up Paddle payments for Kahaani after deployment.

## ✅ Code Integration - ALREADY DONE

- ✅ Paddle SDK installed
- ✅ `/api/paddle/create-checkout` created
- ✅ `/api/paddle/webhook` created
- ✅ Frontend updated to use Paddle

---

## 🚀 Paddle Account Setup (Do After Deployment)

### Why Deploy First?
Paddle requires:
- Live website URL
- Terms & Conditions page
- Privacy Policy page
- Refund Policy page

So you need to deploy first, then set up Paddle.

---

## Step 1: Sign Up for Paddle

1. Go to [https://paddle.com](https://paddle.com)
2. Click "Sign Up"
3. Create a **Sandbox account** (free for testing)
4. Complete basic profile

---

## Step 2: Get API Keys

1. Log into Paddle Dashboard
2. Go to **Developer Tools** → **Authentication**
3. Click **+ Generate API Key**
4. Give it a name: "Kahaani API Key"
5. Copy the API key (starts with `test_` for sandbox or `live_` for production)
6. Save it securely - you'll need it for `.env.local`

---

## Step 3: Create Products & Prices

You need to create 4 products for your credit packages:

### In Paddle Dashboard:
1. Go to **Catalog** → **Products**
2. Click **+ New Product**
3. Create each product:

#### Product 1: Starter Package
- **Product Name**: 25 Kahaani Credits
- **Description**: 25 credits for image and audio generation (~2 stories)
- **Tax Category**: Digital Goods
- **Price**: $20 USD
- Click **Save**
- **Copy the Price ID** (looks like `pri_01xxxxx`)

#### Product 2: Popular Package
- **Product Name**: 100 Kahaani Credits
- **Description**: 100 credits for image and audio generation (~10 stories)
- **Tax Category**: Digital Goods
- **Price**: $70 USD
- Click **Save**
- **Copy the Price ID**

#### Product 3: Pro Package
- **Product Name**: 300 Kahaani Credits
- **Description**: 300 credits for image and audio generation (~30 stories)
- **Tax Category**: Digital Goods
- **Price**: $180 USD
- Click **Save**
- **Copy the Price ID**

#### Product 4: Enterprise Package
- **Product Name**: 1000 Kahaani Credits
- **Description**: 1000 credits for image and audio generation (~100 stories)
- **Tax Category**: Digital Goods
- **Price**: $500 USD
- Click **Save**
- **Copy the Price ID**

---

## Step 4: Configure Environment Variables

Add to your `.env.local` file:

```bash
# Paddle Configuration
PADDLE_ENVIRONMENT=sandbox  # Change to "production" when going live
PADDLE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxx  # Your API key from Step 2

# Price IDs from Paddle Dashboard (Step 3)
PADDLE_PRICE_ID_25=pri_01xxxxx     # 25 credits - $20
PADDLE_PRICE_ID_100=pri_01xxxxx    # 100 credits - $70
PADDLE_PRICE_ID_300=pri_01xxxxx    # 300 credits - $180
PADDLE_PRICE_ID_1000=pri_01xxxxx   # 1000 credits - $500

# Webhook Secret (from Step 5)
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxx

# Your deployed app URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## Step 5: Set Up Webhooks

Webhooks allow Paddle to notify your server when a payment completes.

### In Paddle Dashboard:
1. Go to **Developer Tools** → **Notifications**
2. Click **+ New Notification Destination**
3. Configure:
   - **Destination URL**: `https://yourdomain.com/api/paddle/webhook`
   - **Description**: Kahaani Payment Webhook
4. Select **Events to Subscribe**:
   - ✅ **transaction.completed** (REQUIRED - adds credits after payment)
   - ✅ **transaction.updated** (optional)
   - ✅ **transaction.payment_failed** (optional - for error tracking)
5. Click **Save**
6. **Copy the Webhook Secret Key** (looks like `pdl_ntfset_xxxxx`)
7. Add it to `.env.local` as `PADDLE_WEBHOOK_SECRET`

---

## Step 6: Local Testing (Optional - Before Deployment)

If you want to test locally before deploying:

### Using ngrok for Webhooks:

```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com

# Start ngrok
ngrok http 3005

# You'll get a URL like: https://abc123.ngrok.io
```

Then in Paddle webhook settings, use:
- `https://abc123.ngrok.io/api/paddle/webhook`

### Test Payment Flow:
1. Make sure `.env.local` has all the variables set
2. Restart dev server: `npm run dev`
3. Go to `http://localhost:3005/credits`
4. Click "Buy Now" on any package
5. Use Paddle test card details (see below)
6. Complete payment
7. Check terminal/logs for webhook events
8. Verify credits were added to your account

---

## 🎴 Paddle Test Card Details (Sandbox Mode)

**Test Credit Card:**
- Card Number: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3 digits (e.g., 123)
- ZIP/Postal Code: Any valid format (e.g., 12345)
- Country: Any country

**Alternative Test Cards:**
- **Mastercard**: `5555 5555 5555 4444`
- **Amex**: `3782 822463 10005`
- **Visa Debit**: `4000 0566 5566 5556`

All test cards work the same way in sandbox mode.

---

## 📝 Required Pages for Paddle Approval

Before Paddle approves your account for production, you need these pages on your deployed website:

### 1. Terms of Service (`/terms`)
Must include:
- Service description
- User obligations
- Payment terms
- Refund policy reference
- Intellectual property
- Limitation of liability
- Governing law

### 2. Privacy Policy (`/privacy`)
Must include:
- What data you collect
- How you use it
- Third-party services (Paddle, Supabase, etc.)
- User rights (GDPR compliance)
- Cookie policy
- Contact information

### 3. Refund Policy (`/refund`)
Must include:
- Credit purchases are non-refundable (standard for digital goods)
- Exception cases (if any)
- How to request support
- Contact information

### Templates:
You can use templates from:
- [Termly.io](https://termly.io) (free templates)
- [GetTerms.io](https://getterms.io)
- [TermsFeed](https://termsfeed.com)

Just customize them for your SaaS.

---

## 🚀 Going Live (Production)

### 1. Deploy Your App
- Deploy to Vercel/Railway/your preferred platform
- Make sure all environment variables are set on production
- Verify webhook URL is accessible: `https://yourdomain.com/api/paddle/webhook`

### 2. Complete Paddle Seller Verification
Paddle will ask for:
- ✅ Legal business name (can be your personal name as sole proprietor)
- ✅ Address (your personal address is fine)
- ✅ Website URL (your deployed app)
- ✅ Terms & Conditions URL
- ✅ Privacy Policy URL
- ✅ Bank account details (for payouts)
- ✅ Tax information (PAN card for India)

**Time to approval:** Usually 1-3 business days

### 3. Switch to Production Mode
Once approved:

1. In Paddle Dashboard, switch to **Production** environment
2. Create production API key
3. Create production products & prices (same as sandbox)
4. Update `.env` on production server:
   ```bash
   PADDLE_ENVIRONMENT=production
   PADDLE_API_KEY=live_xxxxx  # Production API key
   # Update all PADDLE_PRICE_ID_* with production price IDs
   ```
5. Update webhook to production URL
6. Redeploy your app

---

## 💰 Paddle Fees

**Per Transaction:**
- 5% Paddle fee
- + Payment processing fees (~2.9% + $0.30)
- **Total: ~7-8% per transaction**

**Example for $100 sale:**
- Paddle takes: ~$7-8
- You receive: ~$92-93

**Payouts:**
- Paddle pays you monthly
- Direct to your bank account
- Supports Indian bank accounts
- Currency: USD or INR (you choose)

---

## 🐛 Troubleshooting

### Credits Not Added After Payment?

1. Check webhook logs in Paddle Dashboard
2. Check your server logs for webhook errors
3. Verify webhook URL is correct
4. Verify `PADDLE_WEBHOOK_SECRET` matches

### Payment Not Going Through?

1. Check API key is correct
2. Check price IDs are correct
3. Check sandbox/production mode matches
4. Check browser console for errors

### Webhook Not Receiving Events?

1. Verify URL is publicly accessible
2. Check firewall settings
3. Use ngrok for local testing
4. Check webhook signature verification

---

## 📞 Support

**Paddle Support:**
- Email: support@paddle.com
- Documentation: https://developer.paddle.com
- Discord: https://discord.gg/paddle

**Your Integration Files:**
- `/pages/api/paddle/create-checkout.ts` - Creates checkout sessions
- `/pages/api/paddle/webhook.ts` - Handles payment webhooks
- `/pages/credits.tsx` - Frontend purchase flow

---

## ✅ Deployment Checklist

Before deploying:
- [ ] Create Terms of Service page
- [ ] Create Privacy Policy page
- [ ] Create Refund Policy page
- [ ] Test local payment flow with ngrok
- [ ] Verify credits are added after test payment

After deploying:
- [ ] Sign up for Paddle
- [ ] Create products & prices
- [ ] Set up webhook with production URL
- [ ] Add all env variables to production
- [ ] Complete seller verification
- [ ] Test production payment
- [ ] Monitor first few real transactions

---

## 🎯 Quick Start (After Deployment)

1. Deploy app with Terms/Privacy/Refund pages
2. Sign up for Paddle: https://paddle.com
3. Create 4 products in Paddle
4. Copy all Price IDs and API key
5. Add to production environment variables
6. Set up webhook
7. Test with sandbox card
8. Complete seller verification
9. Switch to production
10. Start accepting payments! 🎉

---

**Last Updated:** December 2024
**Integration Status:** ✅ Code Ready - Awaiting Deployment
