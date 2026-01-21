# How to See the New Features

## ✅ Requirements

**You MUST be logged in** to see the menu items. The features are only visible when:
- You're signed in with email, OR
- You're connected with a wallet

## 📍 Where to Look

### 1. **Referral Dashboard & Achievements**

**Location**: Top navigation bar (right side)

**Steps to see it:**
1. **Make sure you're logged in** (email or wallet)
2. Look at the top-right of the navigation bar
3. You'll see either:
   - Your email address (if logged in with email) - Click the dropdown arrow
   - Credits display (e.g., "10 credits") - Click the dropdown arrow

**In the Email Dropdown:**
- Click on your email address
- You should see:
  - 🎁 **Referral Program**
  - 🏆 **Achievements**
  - Sign Out

**In the Credits Dropdown:**
- Click on the credits number
- Scroll down past subscription management
- You should see:
  - 🎁 **Referral Program**
  - 🏆 **Achievements**

### 2. **Social Share Buttons**

**Location**: After generating content

**Steps to see it:**
1. Go to **Image** or **Video** tab
2. Generate an image or video
3. Once content is generated, look at the toolbar above the image/video
4. You'll see a **Share** button (📤 icon) next to Save/Download buttons
5. Click it to see sharing options (Twitter, Facebook, LinkedIn, Reddit, Copy Link)

### 3. **If You Don't See the Menus**

**Check these:**

1. **Are you logged in?**
   - If not, sign in with email or connect wallet
   - Menu items only appear when `isConnected = true`

2. **Is the app running?**
   - Make sure the dev server is running: `npm run dev`
   - Or if using production build, restart it

3. **Clear browser cache:**
   - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Or clear cache in browser settings

4. **Check browser console:**
   - Open DevTools (F12)
   - Look for any errors in the Console tab
   - Check if components are loading

5. **Rebuild the app:**
   ```bash
   npm run build
   # or if using dev mode
   npm run dev
   ```

## 🧪 Quick Test

1. **Sign in** (email or wallet)
2. **Look at top-right navigation**
3. **Click your email/credits dropdown**
4. You should see "Referral Program" and "Achievements"

## 📸 Visual Guide

```
Navigation Bar (Top)
┌─────────────────────────────────────────────────────────┐
│ [Logo] [Tabs]                    [Email ▼] [Credits ▼] │
│                                    │        │            │
│                                    ▼        ▼            │
│                              ┌─────────┐ ┌──────────┐  │
│                              │ Referral│ │ Referral │  │
│                              │ Program │ │ Program │  │
│                              │ Achieve │ │ Achieve │  │
│                              │ -ments  │ │ -ments  │  │
│                              │ Sign Out│ │ Refresh  │  │
│                              └─────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 🔍 Debug Steps

If still not visible, check:

1. **Open browser console** (F12)
2. **Type**: `localStorage.getItem('authToken')`
   - If it returns `null`, you're not logged in
3. **Check React DevTools**:
   - Install React DevTools extension
   - Check if `Navigation` component has the state variables:
     - `showReferralDashboard`
     - `showAchievements`

## 📞 Still Not Working?

Check:
- Are you on the latest code? (`git pull`)
- Is the dev server running?
- Any console errors?
- Are you logged in?

The menu items are **definitely in the code** - they're in `Navigation.tsx` lines 277-320 and 388-425.
