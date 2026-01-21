# User Acquisition Features - Location Guide

## 📍 Where to Find Everything

### **Backend API Routes** (All accessible via `/api/...`)

1. **Referral System**
   - `GET /api/referral/code` - Get your referral code
   - `POST /api/referral/apply` - Apply a referral code
   - `GET /api/referral/stats` - View referral statistics
   - `GET /api/referral/leaderboard` - Top referrers
   - `POST /api/referral/share` - Track social share
   - **Location**: `backend/routes/referral.ts`

2. **Achievements**
   - `GET /api/achievements` - Get all achievements with progress
   - `POST /api/achievements/check` - Check for new achievements
   - `POST /api/achievements/login` - Record daily login (streak tracking)
   - `GET /api/achievements/leaderboard` - Achievement leaderboard
   - **Location**: `backend/routes/achievements.ts`

3. **Public Gallery**
   - `GET /api/gallery/public` - Browse public gallery
   - `GET /api/gallery/public/:id` - View single item
   - `GET /api/gallery/public/:id/og` - Open Graph meta tags
   - `GET /api/gallery/public/:id/embed` - Get embed code
   - `GET /api/gallery/featured` - Featured items
   - **Location**: `backend/routes/gallery-public.ts`

4. **Email Marketing**
   - Automatically triggered on signup, low credits, inactivity
   - **Location**: `backend/services/emailMarketing.ts`
   - **Templates**: `backend/templates/emails/index.ts`

### **Frontend Components** (React Components)

1. **ReferralDashboard** 
   - **File**: `src/components/ReferralDashboard.tsx`
   - **Status**: ✅ Created, needs to be added to Navigation menu
   - **Features**: Referral code, share links, stats, leaderboard

2. **SocialShareButtons**
   - **File**: `src/components/SocialShareButtons.tsx`
   - **Status**: ✅ Integrated into ImageOutput and VideoGenerator
   - **Location**: Share button appears in toolbar when content is generated

3. **OnboardingWizard**
   - **File**: `src/components/OnboardingWizard.tsx`
   - **Status**: ✅ Created, needs to be triggered for new users
   - **Features**: Multi-step tutorial with +5 credits on completion

4. **AchievementBadge**
   - **File**: `src/components/AchievementBadge.tsx`
   - **Status**: ✅ Created, needs to be added to Navigation menu
   - **Features**: View achievements, progress, leaderboard

5. **PublicGallery**
   - **File**: `src/components/PublicGallery.tsx`
   - **Status**: ✅ Created, needs to be added as a tab or in menu
   - **Features**: Browse community creations, embed codes, sharing

### **Discord Bot Commands**

1. **Referral Commands**
   - `/referral code` - Get your referral code
   - `/referral stats` - View your referral statistics
   - `/referral leaderboard` - See top referrers
   - **Location**: `discord-bot/src/commands/referral.ts`

### **Database Models**

1. **User Model** (`backend/models/User.ts`)
   - Added fields: `referralCode`, `referredBy`, `referralCount`, `referralCreditsEarned`
   - Added fields: `socialShares`, `achievements`, `loginStreak`, `onboardingCompleted`

2. **Referral Model** (`backend/models/Referral.ts`)
   - Tracks individual referral events

3. **DiscordUser Model** (`discord-bot/src/database/models/DiscordUser.ts`)
   - Added referral fields for Discord bot integration

## 🚀 How to Access Features (After Integration)

### **In the Web App:**

1. **Referral Dashboard**
   - Click user menu → "Referral Program"
   - Or: Credits dropdown → "Referral Program"

2. **Achievements**
   - Click user menu → "Achievements"
   - Or: Credits dropdown → "View Achievements"

3. **Public Gallery**
   - New tab in main navigation: "Community Gallery"
   - Or: Add to existing Gallery tab

4. **Onboarding Wizard**
   - Automatically shows for new users (first visit)
   - Can be manually triggered from user menu

5. **Social Sharing**
   - Automatically appears in ImageOutput and VideoGenerator toolbars
   - Share button next to Save/Download buttons

### **In Discord:**

- Use `/referral` command with subcommands:
  - `/referral code` - Get your code
  - `/referral stats` - View stats
  - `/referral leaderboard` - See leaderboard

## 📝 Next Steps to Make Features Visible

To make these features accessible in the UI, you need to:

1. **Add to Navigation.tsx**:
   - Import the new components
   - Add menu items in the user dropdown
   - Add state for showing modals

2. **Add OnboardingWizard trigger**:
   - Check if user is new in App.tsx
   - Show wizard on first visit

3. **Add Public Gallery tab**:
   - Add to tabs array in App.tsx
   - Or integrate into existing Gallery component

4. **Add daily login tracking**:
   - Call `/api/achievements/login` on app load for authenticated users

## 🔧 Integration Example

Here's how to add ReferralDashboard to Navigation:

```tsx
// In Navigation.tsx
import ReferralDashboard from './ReferralDashboard';
import AchievementBadge from './AchievementBadge';

// Add state
const [showReferralDashboard, setShowReferralDashboard] = useState(false);
const [showAchievements, setShowAchievements] = useState(false);

// Add menu items in dropdown
<button onClick={() => { setShowReferralDashboard(true); setShowUserDropdown(false); }}>
  <Gift className="w-4 h-4" />
  <span>Referral Program</span>
</button>

// Add modals at bottom
{showReferralDashboard && (
  <ReferralDashboard 
    isOpen={showReferralDashboard} 
    onClose={() => setShowReferralDashboard(false)} 
  />
)}
```
