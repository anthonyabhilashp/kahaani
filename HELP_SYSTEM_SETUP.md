# Help & Support System Setup Guide

Your help system is now fully integrated! Here's how it works and how to complete the setup.

## ✅ What's Already Built

1. **Knowledge Base** (25 comprehensive articles)
   - Located in: `/lib/knowledgeBase.ts`
   - Categories: Getting Started, Story Creation, Media Generation, Advanced Features, Troubleshooting, Credits & Billing

2. **Searchable Help Widget**
   - Component: `/components/HelpWidget.tsx`
   - Features:
     - Real-time search across all articles
     - Browse by category
     - Clean, mobile-friendly UI
     - Matches your orange theme

3. **Help Buttons**
   - Added to both mobile and desktop sidebars
   - Opens help widget dialog
   - Falls back to Tawk.to chat

4. **Tawk.to Integration**
   - Component: `/components/TawkToChat.tsx`
   - Added to `_app.tsx`
   - Ready to connect when you add credentials

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Sign up for Tawk.to (FREE)

1. Go to https://www.tawk.to/
2. Click "Sign Up Free"
3. Create your account (no credit card needed)

### Step 2: Get Your Credentials

After signing up:

1. Go to **Administration** → **Property**
2. Find your **Property ID** (looks like: `63f4b2c3d4e5f6a7b8c9d0e1`)
3. Find your **Widget ID** (usually "default" or similar)

### Step 3: Add to Environment Variables

Add these to your `.env.local` file:

```bash
# Tawk.to Chat Support
NEXT_PUBLIC_TAWK_PROPERTY_ID=your_property_id_here
NEXT_PUBLIC_TAWK_WIDGET_ID=default
```

**Example:**
```bash
NEXT_PUBLIC_TAWK_PROPERTY_ID=63f4b2c3d4e5f6a7b8c9d0e1
NEXT_PUBLIC_TAWK_WIDGET_ID=default
```

### Step 4: Restart Your Dev Server

```bash
# Stop your server (Ctrl+C)
# Start again
npm run dev
```

### Step 5: Test It!

1. Go to your dashboard
2. Click "Help & Support" button in sidebar
3. Browse the knowledge base or search for topics
4. Click "Chat with Support" button at bottom
5. Tawk.to chat should open!

---

## 📱 How It Works

### User Flow:

```
User clicks "Help & Support" button
  ↓
Help Widget opens with knowledge base
  ↓
User can:
  - Search all 25 articles
  - Browse by category
  - Read full articles
  ↓
If they can't find answer:
  - Click "Chat with Support" button
  ↓
Tawk.to chat opens
  ↓
You get notified on:
  - Tawk.to mobile app (iOS/Android)
  - Tawk.to dashboard
  - Email (if configured)
```

---

## 🎨 Customizing Tawk.to

After setup, customize in Tawk.to dashboard:

### Appearance:
- **Color**: Change to match your orange theme (#ea580c)
- **Position**: Bottom right (default is good)
- **Widget text**: "Need help?" or "Chat with us"

### Pre-Chat Form:
- Collect user email/name before chat
- Helps you provide better support

### Canned Responses:
- Create quick replies for common questions
- Reference knowledge base articles

---

## 📝 Knowledge Base Articles

All 25 articles are in `/lib/knowledgeBase.ts`. You can:

### Add New Articles:

```typescript
{
  id: 'unique-id',
  title: 'Article Title',
  category: 'category-id', // getting-started, story-creation, etc.
  keywords: ['keyword1', 'keyword2', 'search', 'terms'],
  content: `# Article Title

  Your content here in markdown format...

  ## Sections
  - Use bullet points
  - Add examples
  ✅ Use emojis for better UX
  `
}
```

### Edit Existing Articles:

Just update the content in `/lib/knowledgeBase.ts` and reload the page!

### Add New Categories:

Update the `categories` array in `/lib/knowledgeBase.ts`:

```typescript
export const categories = [
  { id: 'new-category', name: '🎯 Category Name', icon: '🎯' },
  // ... existing categories
];
```

---

## 🔧 Troubleshooting

### Tawk.to not showing:

1. **Check environment variables are set**
   ```bash
   echo $NEXT_PUBLIC_TAWK_PROPERTY_ID
   ```

2. **Restart dev server** after adding env vars

3. **Check browser console** for errors (F12)

### Knowledge base not searching:

- Articles search by: title, keywords, and content
- Make sure keywords are relevant
- Search is case-insensitive

### Help button not opening:

- Check no JavaScript errors in console
- Ensure Dialog component is imported correctly

---

## 📊 Monitoring

### Tawk.to Dashboard:

Track:
- Number of chats
- Response times
- Common questions
- User satisfaction

### Improving Knowledge Base:

1. **Monitor common questions** in Tawk.to
2. **Add new articles** for repeated questions
3. **Update keywords** to improve search
4. **Refine content** based on feedback

---

## 🚀 Next Steps (After Launch)

### Week 1:
- Monitor what users search for
- See what questions reach Tawk.to
- Identify gaps in knowledge base

### Week 2:
- Add articles for common questions
- Update existing articles with clarifications
- Configure Tawk.to automated responses

### Month 2+:
- Consider AI chatbot (if volume is high)
- Add more advanced features
- Build FAQ page for SEO

---

## 💡 Pro Tips

1. **Response Templates**: Create templates in Tawk.to for common questions, paste from knowledge base

2. **Mobile App**: Download Tawk.to mobile app for instant notifications

3. **Set Hours**: Configure business hours in Tawk.to (auto-replies when offline)

4. **Analytics**: Use Tawk.to reports to understand support needs

5. **Knowledge Base Updates**: Update articles monthly based on user feedback

---

## 🎯 Support Best Practices

### When to Update Knowledge Base:
- Same question asked 3+ times → Add article
- Unclear article → Improve it
- New feature launched → Add documentation

### When to Use Tawk.to:
- Bug reports
- Account-specific issues
- Complex problems
- Feedback and suggestions

### Response Time Goals:
- Aim for < 1 hour during business hours
- Use canned responses for speed
- Link to knowledge base articles when relevant

---

## 📞 Need Help?

If you have questions about this system:
1. Check this README
2. Review code comments in:
   - `/lib/knowledgeBase.ts`
   - `/components/HelpWidget.tsx`
   - `/components/TawkToChat.tsx`

---

## ✨ Summary

You now have a complete support system:

✅ 25 comprehensive knowledge base articles
✅ Searchable help widget with beautiful UI
✅ Category browsing
✅ Tawk.to live chat fallback
✅ Mobile-friendly
✅ FREE (Tawk.to free tier)
✅ Ready for launch!

Just add your Tawk.to credentials and you're good to go! 🚀
