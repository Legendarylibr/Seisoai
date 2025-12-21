# 🛡️ Cloudflare AI Bot Protection Setup Guide

## 🎯 Overview

This guide will help you configure Cloudflare to block AI bots from accessing your Seisoai assets while allowing legitimate search engine bots.

## ✅ Quick Setup Steps

### Step 1: Access Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain (`seisiai.com` or the domain you're using)
3. Click on **Security** in the left sidebar
4. Click on **Bots**

### Step 2: Configure Bot Fight Mode (Free Plan)

1. In the **Bots** section, find **Bot Fight Mode**
2. Toggle it **ON** (if not already enabled)
   - This provides basic bot protection for free

### Step 3: Configure AI Bot Blocking (Recommended)

1. In the **Bots** section, look for **"Review and block AI bots from accessing your assets"**
2. Click the button with the chevron (→) or the notification card
3. You'll see options for:
   - **AI Scrapers and Crawlers** - Block these ✅
   - **Search Engine Bots** - Allow these ✅

### Step 4: Set Up Bot Rules (Recommended Configuration)

1. Go to **Security** → **Bots** → **Bot Management** (if available on your plan)
2. Or use **WAF** → **Custom Rules** for more control

#### Recommended Settings:

**Block:**
- ✅ AI Training Crawlers (ChatGPT, Google Bard, etc.)
- ✅ Unknown/Suspicious Bots
- ✅ Automated Scrapers

**Allow:**
- ✅ Googlebot (for SEO)
- ✅ Bingbot (for SEO)
- ✅ Other legitimate search engines
- ✅ Your own API calls
- ✅ Legitimate user traffic

### Step 5: Create Custom WAF Rule (Advanced - Optional)

If you want more granular control:

1. Go to **Security** → **WAF** → **Custom Rules**
2. Click **Create rule**
3. Configure:

```
Rule Name: Block AI Training Bots
Field: User Agent
Operator: contains
Value: (add common AI bot user agents)
Action: Block
```

Common AI Bot User Agents to Block:
- `GPTBot`
- `ChatGPT-User`
- `CCBot`
- `anthropic-ai`
- `Google-Extended`
- `PerplexityBot`
- `BingPreview`

### Step 6: Verify Configuration

1. Go to **Analytics** → **Security**
2. Check **Bot Traffic** section
3. You should see blocked bot requests
4. Monitor for a few days to ensure legitimate traffic isn't blocked

## 🔧 Alternative: Using Cloudflare API (Automated)

If you prefer to automate this, you can use the Cloudflare API:

### Prerequisites

1. Get your Cloudflare API Token:
   - Go to **My Profile** → **API Tokens**
   - Create token with permissions: `Zone:Edit`, `WAF:Edit`

2. Get your Zone ID:
   - Go to your domain overview
   - Zone ID is shown in the right sidebar

### API Configuration Script

```bash
#!/bin/bash

# Cloudflare Bot Protection Setup
# Replace these with your actual values
CLOUDFLARE_API_TOKEN="your_api_token_here"
ZONE_ID="your_zone_id_here"
DOMAIN="seisiai.com"

# Enable Bot Fight Mode
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/bot_fight_mode" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"value":"on"}'

# Create WAF rule to block AI bots
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/firewall/rules" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "action": "block",
    "description": "Block AI Training Bots",
    "expression": "(http.user_agent contains \"GPTBot\" or http.user_agent contains \"ChatGPT-User\" or http.user_agent contains \"CCBot\" or http.user_agent contains \"anthropic-ai\" or http.user_agent contains \"Google-Extended\" or http.user_agent contains \"PerplexityBot\" or http.user_agent contains \"BingPreview\") and not (http.user_agent contains \"Googlebot\" or http.user_agent contains \"Bingbot\")"
  }'

echo "✅ Cloudflare bot protection configured!"
```

## 📊 Monitoring Bot Traffic

### View Bot Analytics

1. Go to **Analytics** → **Security**
2. Check **Bot Traffic** metrics:
   - Total bot requests
   - Blocked bots
   - Allowed bots
   - Bot score distribution

### Check Logs

1. Go to **Analytics** → **Logs**
2. Filter by:
   - Action: `blocked`
   - Category: `bot`
3. Review blocked requests to ensure no false positives

## 🎯 Recommended Configuration Summary

### For Seisoai (AI Image Generation Service):

**✅ Enable:**
- Bot Fight Mode (free basic protection)
- AI Scraper blocking
- Suspicious bot blocking

**✅ Allow:**
- Googlebot (SEO)
- Bingbot (SEO)
- Your API endpoints
- Legitimate user traffic

**✅ Monitor:**
- Check analytics weekly
- Review blocked requests
- Adjust rules if needed

## 🐛 Troubleshooting

### Issue: Legitimate Users Getting Blocked

**Solution:**
1. Check **Analytics** → **Security** → **Bot Traffic**
2. Review blocked requests
3. Adjust WAF rules to be less strict
4. Add exceptions for known good user agents

### Issue: Search Engines Not Indexing

**Solution:**
1. Verify Googlebot and Bingbot are allowed
2. Check **Security** → **Bots** settings
3. Test with: `curl -A "Googlebot" https://www.seisiai.com`
4. Should return 200 OK, not blocked

### Issue: Too Many False Positives

**Solution:**
1. Review blocked requests in logs
2. Identify patterns
3. Create allowlist rules for legitimate traffic
4. Adjust bot score thresholds if available

## 📋 Checklist

- [ ] Bot Fight Mode enabled
- [ ] AI bot blocking configured
- [ ] Search engine bots allowed (Googlebot, Bingbot)
- [ ] Custom WAF rules created (optional)
- [ ] Analytics monitoring set up
- [ ] Tested with legitimate user agent
- [ ] Verified search engines can still access
- [ ] Monitored for false positives

## 🔗 Useful Links

- [Cloudflare Bot Management Docs](https://developers.cloudflare.com/bots/)
- [Cloudflare WAF Rules](https://developers.cloudflare.com/waf/)
- [Cloudflare API Documentation](https://developers.cloudflare.com/api/)

## 💡 Best Practices

1. **Start Conservative**: Begin with basic bot blocking, then add more rules
2. **Monitor Regularly**: Check analytics weekly for the first month
3. **Test Changes**: Always test after making rule changes
4. **Document Rules**: Keep notes on why each rule exists
5. **Review Logs**: Check blocked requests to catch false positives early

---

**✅ Once configured, your Seisoai assets will be protected from AI training bots while maintaining SEO and user access!**
