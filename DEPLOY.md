# Deploy to Railway - Step by Step

## Pre-Deployment Checklist

✅ Railway config files created (`railway.json`, `.railwayignore`)
✅ Package.json has correct build scripts
✅ All code changes committed to GitHub

---

## Step 1: Commit Railway Config Files

```bash
git add railway.json .railwayignore
git commit -m "Add Railway deployment config"
git push origin master
```

---

## Step 2: Create Railway Account

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Sign up with **GitHub** (easiest)
4. Verify your email

**Note**: You get **$5 free credit** to test

---

## Step 3: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository: **`kahaani`**
4. Railway will auto-detect it's a Next.js app ✅

---

## Step 4: Add Environment Variables

Click on your deployed service → **Variables** tab → Add all these:

### Required Variables (Copy from your .env.local):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI APIs
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# Model Configuration
PROVIDER=openrouter
SCENE_MODEL=mistralai/mistral-7b-instruct
IMAGE_MODEL=google/gemini-2.5-flash-image

# Video Settings
ASPECT_RATIO=9:16
VIDEO_WIDTH=1080
VIDEO_HEIGHT=1920
MAX_CONCURRENT_VIDEOS=10

# Paddle (add these when ready for payments)
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=your_paddle_api_key
PADDLE_WEBHOOK_SECRET=your_paddle_webhook_secret
PADDLE_PRICE_ID_25=prctid_xxx
PADDLE_PRICE_ID_100=prctid_xxx
PADDLE_PRICE_ID_300=prctid_xxx
PADDLE_PRICE_ID_1000=prctid_xxx
```

**Important**:
- Click **"Add Variable"** for each one
- Or use **"Raw Editor"** to paste all at once

---

## Step 5: Deploy!

Railway will automatically:
1. ✅ Install dependencies (`npm install`)
2. ✅ Build your app (`npm run build`)
3. ✅ Start the server (`npm start`)

**Watch the deployment logs** - takes 2-5 minutes.

---

## Step 6: Get Your URL

Once deployed:
1. Click **"Settings"** tab
2. Under **"Domains"**, you'll see: `your-app.up.railway.app`
3. Copy this URL and test it!

---

## Step 7: Run SQL Migration in Supabase

**CRITICAL**: Before testing with real users:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `supabase/migrations/001_atomic_credit_functions.sql`
3. Copy/paste the SQL
4. Click **"Run"**

This adds atomic credit functions to prevent race conditions.

---

## Step 8: Test Your Deployment

Follow the steps in **TESTING.md**:

1. ✅ Test credit deduction (no negative balance)
2. ✅ Test video concurrency (max 10 concurrent)
3. ✅ Generate a complete story end-to-end

---

## Troubleshooting

### Build fails?
- Check **Logs** tab for errors
- Verify all environment variables are set
- Make sure `railway.json` is committed

### FFmpeg not found?
- Railway's Nixpacks auto-detects and installs ffmpeg ✅
- If issues persist, check logs for specific error

### Timeout errors?
- Railway has no hard timeout limits for long processes
- Videos can take 60-90+ seconds - this is fine

### Out of credits?
- Railway charges based on usage
- Check **Usage** tab in dashboard
- Add payment method or upgrade plan

---

## Next Steps After Successful Deploy

1. ✅ Test multi-user features (TESTING.md)
2. 🌐 Buy domain: **storyai.studio**
3. 🔗 Connect domain to Railway (Settings → Domains → Custom Domain)
4. 💳 Set up Paddle for payments (PAYMENT.md)
5. 📄 Create Terms/Privacy/Refund pages
6. 🚀 Launch!

---

## Cost Estimate

**Railway Pricing**:
- Hobby Plan: ~$5-20/month (pay for what you use)
- Scales automatically with traffic
- No surprise bills (can set spend limits)

**Your App**:
- Low traffic: ~$5-10/month
- Medium traffic (100+ users): ~$15-30/month
- High traffic: Scales accordingly

---

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Need help? Check deployment logs first

---

**Ready to deploy? Start with Step 1!**
