# Google OAuth Setup Guide

## Overview
This guide will help you enable Google Sign-In for your app using Supabase.

---

## Step 1: Create Google OAuth Credentials

### 1.1 Go to Google Cloud Console
1. Visit https://console.cloud.google.com
2. Create a new project or select existing one
3. Name it: "Kahaani" (or your app name)

### 1.2 Enable Google+ API
1. Go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click **Enable**

### 1.3 Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (for public app)
3. Click **Create**

**Fill in the form:**
- App name: `Kahaani` (or your app name)
- User support email: Your email
- Developer contact: Your email
- App logo: (optional, upload your logo)

**Scopes:**
- Click **Add or Remove Scopes**
- Select:
  - `userinfo.email`
  - `userinfo.profile`
- Click **Update**

**Test users** (for development):
- Add your email address
- Click **Save and Continue**

### 1.4 Create OAuth 2.0 Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Kahaani Web Client`

**Important - Authorized redirect URIs:**

Add this URL (you'll get it from Supabase in Step 2):
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

5. Click **Create**
6. **Copy your Client ID and Client Secret** (you'll need these!)

---

## Step 2: Configure Supabase

### 2.1 Get Supabase Callback URL
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **Providers**
4. Find **Google** provider
5. **Copy the Callback URL** (looks like: `https://xxxxx.supabase.co/auth/v1/callback`)

### 2.2 Add Callback URL to Google Console
1. Go back to Google Cloud Console
2. Go to **APIs & Services** → **Credentials**
3. Click on your OAuth client
4. Under **Authorized redirect URIs**, paste the Supabase callback URL
5. Click **Save**

### 2.3 Enable Google Auth in Supabase
1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Google** and click to expand
3. Toggle **Enable Google provider** to ON
4. Paste your **Client ID** from Google
5. Paste your **Client Secret** from Google
6. Click **Save**

---

## Step 3: Update Your App URLs (After Deployment)

### 3.1 For Railway Deployment

Once you deploy to Railway, you'll get a URL like:
```
https://your-app.up.railway.app
```

**Update Authorized Redirect URIs in Google Console:**
1. Go to Google Cloud Console → Credentials
2. Edit your OAuth client
3. Add these URLs:
   ```
   https://your-app.up.railway.app
   https://your-app.up.railway.app/
   ```
4. Click **Save**

### 3.2 For Custom Domain (storyai.studio)

When you add your custom domain, add these URLs too:
```
https://storyai.studio
https://storyai.studio/
```

---

## Step 4: Test Google Sign-In

### Local Testing:
1. Run your app: `npm run dev`
2. Go to `/login` or `/signup`
3. Click "Sign in with Google"
4. You should see Google's OAuth consent screen
5. Approve the permissions
6. You should be redirected back to your app and logged in

### Troubleshooting:
- **"redirect_uri_mismatch"**: Check authorized redirect URIs match exactly
- **"access_denied"**: Make sure your email is in test users (if app not published)
- **"invalid_client"**: Check Client ID/Secret are correct in Supabase

---

## Step 5: Publish Your OAuth App (For Production)

### For Production Launch:

1. Go to Google Cloud Console → **OAuth consent screen**
2. Click **Publish App**
3. Submit for verification (if needed)

**Note**: While in "Testing" mode, only test users can sign in. Publishing allows anyone with a Google account to sign in.

---

## Security Best Practices

✅ **Never commit Google Client Secret to git** (it's in Supabase, not your code)
✅ **Keep authorized redirect URIs limited** to only your actual domains
✅ **Review OAuth scopes** - only request what you need
✅ **Monitor usage** in Google Cloud Console

---

## Summary Checklist

- [ ] Created Google Cloud project
- [ ] Enabled Google+ API
- [ ] Configured OAuth consent screen
- [ ] Created OAuth 2.0 credentials
- [ ] Added Supabase callback URL to Google
- [ ] Enabled Google provider in Supabase
- [ ] Added Client ID & Secret to Supabase
- [ ] Tested Google sign-in locally
- [ ] Updated redirect URIs for production (after deployment)
- [ ] Published OAuth app (for production)

---

## Need Help?

- Google OAuth Docs: https://developers.google.com/identity/protocols/oauth2
- Supabase Auth Docs: https://supabase.com/docs/guides/auth/social-login/auth-google

---

**Ready to set up?** Start with Step 1 and work your way through. Takes about 10-15 minutes total.
