# Credit Functionality Audit

**Date:** 2025-01-24  
**Status:** Comprehensive Audit Complete

---

## Executive Summary

This audit examines the complete credit system including backend operations, frontend display, error handling, and edge cases. The system has several critical issues that can result in credit loss and incorrect balance display.

---

## 🔴 Critical Issues

### 1. **Credits Deducted Before Generation - No Rollback on Failure**

**Location:** `backend/server.js:1825-2112` (`/api/generate/image`)

**Problem:**
- Credits are deducted IMMEDIATELY when the request arrives (line 1841-1850)
- If image generation fails AFTER credits are deducted, credits are NOT refunded
- User loses credits even if no image was generated

**Code Flow:**
```javascript
// Line 1841-1850: Credits deducted FIRST
const updateResult = await User.findOneAndUpdate(
  {
    ...updateQuery,
    credits: { $gte: creditsToDeduct }
  },
  { 
    $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } 
  },
  { new: true }
);

// Lines 2000-2112: Generation happens AFTER
// If this fails, credits are already gone - NO REFUND
const response = await fetch(endpoint, { ... });
if (!response.ok) {
  // Credits already deducted, but no refund!
  return res.status(response.status).json({ 
    success: false, 
    error: 'Image generation failed' 
  });
}
```

**Impact:** 
- Users lose credits when generation fails due to:
  - API errors (fal.ai service down)
  - Network timeouts
  - Invalid prompts (rejected by AI service)
  - Rate limiting
  - Authentication failures

**Severity:** 🔴 **CRITICAL** - Users lose money on failed generations

**Recommendation:** 
- **Option A (Recommended):** Deduct credits AFTER successful generation
- **Option B:** Implement rollback mechanism with transaction tracking

---

### 2. **Optimistic UI Updates Can Show Wrong Credits**

**Location:** `src/components/GenerateButton.jsx:170-178`

**Problem:**
- Frontend optimistically deducts credits BEFORE backend confirms
- If backend fails or rejects, frontend still shows reduced credits
- Credits refresh happens in catch block, but might not always work

**Code:**
```javascript
// Line 170-178: Optimistic update
const currentCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
const newCredits = Math.max(0, currentCredits - creditsToDeduct);

if (isEmailAuth && emailContext.setCreditsManually) {
  emailContext.setCreditsManually(newCredits); // Updates UI immediately
} else if (!isEmailAuth && setCreditsManually) {
  setCreditsManually(newCredits); // Updates UI immediately
}

// If generation fails, credits are refreshed in catch block (line 281-293)
// But if refresh fails, UI shows wrong value
```

**Impact:** 
- Users see incorrect credit balance if:
  - Generation fails and refresh fails
  - Network error during refresh
  - Backend rejects request after optimistic update

**Severity:** 🟡 **HIGH** - User experience issue, but credits are still correct in database

**Recommendation:**
- Only update optimistically if we're confident backend will succeed
- Always refresh after operation completes (already done, but ensure it's reliable)
- Show loading state during refresh

---

### 3. **No Credit Refund on Generation Failure**

**Location:** `backend/server.js:2009-2112`

**Problem:**
- When generation fails (API error, network timeout, etc.), credits are already deducted
- No mechanism to refund credits back to user
- Error response doesn't indicate credits were deducted

**Code:**
```javascript
// Line 2009-2062: Error handling
if (!response.ok) {
  // Credits already deducted at line 1841-1850
  // But no refund here!
  return res.status(response.status).json({ 
    success: false, 
    error: 'Image generation failed' 
  });
}

// Line 2109-2112: Catch block
catch (error) {
  // Credits already deducted, but no refund!
  res.status(500).json({ success: false, error: 'Failed to generate image' });
}
```

**Impact:**
- Users lose credits on every failed generation
- No way to recover lost credits automatically
- Poor user experience

**Severity:** 🔴 **CRITICAL** - Direct financial loss for users

**Recommendation:**
- Implement rollback mechanism
- Or move credit deduction to AFTER successful generation

---

## ⚠️ High Priority Issues

### 4. **Race Condition Between Email and Wallet Contexts**

**Location:** `src/components/Navigation.jsx:18-32`

**Problem:**
- Both `EmailAuthContext` and `SimpleWalletContext` can be active simultaneously
- Credits are selected based on `isEmailAuth`, but both contexts might be fetching
- If user switches between auth methods, credits might flicker or show wrong value

**Code:**
```javascript
// Line 29-31: Credit selection
const credits = isEmailAuth 
  ? validateCredits(emailContext.credits)
  : validateCredits(walletContext.credits);
```

**Impact:**
- Credits might not display correctly when switching between auth methods
- Both contexts refresh independently (15 second intervals)
- Potential for race conditions

**Severity:** 🟡 **MEDIUM** - Mostly UI issue, but can confuse users

**Recommendation:**
- Ensure only one context is active at a time
- Or properly handle both contexts being active with clear priority

---

### 5. **Multiple Refresh Intervals Can Cause Race Conditions**

**Location:** 
- `src/contexts/EmailAuthContext.jsx:240-245` (15 second interval)
- `src/contexts/SimpleWalletContext.jsx:518-522` (15 second interval)

**Problem:**
- Both contexts refresh credits every 15 seconds independently
- If both are active, two refresh requests happen simultaneously
- Can cause race conditions or unnecessary API calls

**Code:**
```javascript
// EmailAuthContext - Line 240-245
const refreshInterval = setInterval(() => {
  if (document.visibilityState === 'visible') {
    safeFetchUserData(); // Fetches credits
  }
}, 15000);

// SimpleWalletContext - Line 518-522
const refreshInterval = setInterval(() => {
  if (document.visibilityState === 'visible') {
    fetchCredits(address, 3, true).catch(() => {}); // Fetches credits
  }
}, 15000);
```

**Impact:**
- Unnecessary API calls (2x refresh rate when both contexts active)
- Potential race conditions
- Inconsistent credit display

**Severity:** 🟡 **MEDIUM** - Performance and consistency issue

**Recommendation:**
- Coordinate refresh intervals
- Use a single shared refresh mechanism
- Or ensure only one context is active at a time

---

### 6. **Credit Refresh Not Always Called After Operations**

**Location:** Multiple locations

**Problem:**
- After successful generation, credits are updated from `remainingCredits` in response
- But if response doesn't include `remainingCredits`, credits aren't refreshed
- Some operations don't refresh credits at all

**Examples:**
- `src/components/GenerateButton.jsx:228-254` - Only updates if `remainingCredits` exists, then refreshes
- `src/components/ImageOutput.jsx` - Only updates if `remainingCredits` exists

**Impact:**
- Credits might not update if backend response format changes or is missing
- Stale credit display

**Severity:** 🟡 **MEDIUM** - Can cause confusion but credits are correct in database

**Recommendation:**
- Always refresh credits after operations, regardless of response format
- Make `remainingCredits` mandatory in all responses

---

## ✅ Positive Findings

### 1. **Atomic Credit Operations**

**Location:** `backend/server.js:3604-3693` (`addCreditsToUser`)

**Strengths:**
- Uses MongoDB atomic operations (`$inc`, `$push`)
- Prevents race conditions at database level
- Idempotency check prevents duplicate credit grants
- Works with both wallet and email users

**Code:**
```javascript
// Line 3659-3671: Atomic update
const updatedUser = await User.findOneAndUpdate(
  updateQuery,
  {
    $inc: { 
      credits: credits,
      totalCreditsEarned: credits
    },
    $push: {
      paymentHistory: paymentEntry
    }
  },
  { new: true }
);
```

**Status:** ✅ **GOOD** - Well implemented

---

### 2. **Credit Validation**

**Location:** 
- `src/contexts/EmailAuthContext.jsx:118-125`
- `src/contexts/SimpleWalletContext.jsx:134-141`
- `src/components/Navigation.jsx:21-25`

**Strengths:**
- Credits are validated at multiple layers
- Prevents negative credits
- Handles null/undefined values
- Ensures integer values

**Code:**
```javascript
const validateCredits = (value) => {
  if (value == null) return 0;
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(Math.floor(num), Number.MAX_SAFE_INTEGER));
};
```

**Status:** ✅ **GOOD** - Comprehensive validation

---

### 3. **Payment History Tracking**

**Location:** `backend/server.js:3628-3644`

**Strengths:**
- All credit additions are recorded in payment history
- Includes transaction hash, amount, credits, timestamp
- Supports both Stripe and token payments
- Idempotency prevents duplicates

**Status:** ✅ **GOOD** - Complete audit trail

---

### 4. **Subscription Credit Calculation**

**Location:** `backend/server.js:3579-3600` (`calculateSubscriptionCredits`)

**Strengths:**
- Consistent calculation across webhook and verification endpoints
- Supports scaling multipliers (10%, 20%, 30% bonuses)
- NFT holder multiplier (20% bonus)
- Base rate: 5 credits per dollar

**Code:**
```javascript
const baseRate = 5; // 5 credits per dollar
let scalingMultiplier = 1.0;
if (amountInDollars >= 80) {
  scalingMultiplier = 1.3; // 30% bonus
} else if (amountInDollars >= 40) {
  scalingMultiplier = 1.2; // 20% bonus
} else if (amountInDollars >= 20) {
  scalingMultiplier = 1.1; // 10% bonus
}

const nftMultiplier = isNFTHolder ? 1.2 : 1;
const finalCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);
```

**Status:** ✅ **GOOD** - Well structured and consistent

---

## 📊 Credit System Architecture

### Backend Credit Operations

1. **Credit Addition** (`addCreditsToUser`)
   - ✅ Atomic operation
   - ✅ Idempotency check
   - ✅ Payment history tracking
   - ✅ Works with wallet/email/userId

2. **Credit Deduction** (`/api/generate/image`)
   - ❌ Deducts BEFORE generation
   - ❌ No rollback on failure
   - ✅ Atomic operation
   - ✅ Prevents negative credits

3. **Credit Retrieval**
   - ✅ `/api/users/:walletAddress` - Returns credits
   - ✅ `/api/auth/me` - Returns credits
   - ✅ Cache-control headers prevent caching
   - ✅ Always returns credits (defaults to 0)

### Frontend Credit Management

1. **EmailAuthContext**
   - ✅ Fetches from `/api/auth/me`
   - ✅ Validates credits
   - ✅ Periodic refresh (15 seconds)
   - ✅ Error handling with retry

2. **SimpleWalletContext**
   - ✅ Fetches from `/api/users/:walletAddress`
   - ✅ Validates credits
   - ✅ Periodic refresh (15 seconds)
   - ✅ Cache-busting for mobile

3. **Credit Display**
   - ✅ Navigation component shows credits
   - ✅ Validates before display
   - ✅ Loading states
   - ⚠️ Potential race condition between contexts

---

## 🔧 Recommended Fixes

### Priority 1: Fix Credit Deduction Timing

**Option A: Deduct Credits After Generation (Recommended)**

```javascript
app.post('/api/generate/image', freeImageRateLimiter, requireCreditsForModel(), async (req, res) => {
  try {
    const user = req.user;
    const creditsToDeduct = req.requiredCredits || 1;
    
    // Check credits but don't deduct yet
    if (user.credits < creditsToDeduct) {
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${user.credits} but need ${creditsToDeduct}.`
      });
    }
    
    // Generate image first
    const response = await fetch(endpoint, { ... });
    if (!response.ok) {
      // No credits deducted yet, so no refund needed
      return res.status(response.status).json({ 
        success: false, 
        error: 'Image generation failed' 
      });
    }
    
    const data = await response.json();
    const imageUrls = extractImageUrls(data);
    
    if (imageUrls.length > 0) {
      // Only deduct credits if generation succeeded
      const updateQuery = buildUserUpdateQuery(user);
      const updateResult = await User.findOneAndUpdate(
        {
          ...updateQuery,
          credits: { $gte: creditsToDeduct }
        },
        { 
          $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } 
        },
        { new: true }
      );
      
      if (!updateResult) {
        // Race condition - credits were spent between check and deduction
        // This is rare, but we should handle it
        logger.warn('Credit deduction race condition', { userId: user.userId });
        // Still return images, but log the issue
      }
      
      res.json({ 
        success: true, 
        images: imageUrls,
        remainingCredits: updateResult?.credits || user.credits - creditsToDeduct
      });
    } else {
      res.status(500).json({ success: false, error: 'No image generated' });
    }
  } catch (error) {
    // No credits deducted, so no refund needed
    res.status(500).json({ success: false, error: 'Failed to generate image' });
  }
});
```

**Option B: Implement Rollback Mechanism**

```javascript
// Deduct credits first, but store transaction ID
const transactionId = generateTransactionId();
const updateResult = await User.findOneAndUpdate(
  {
    ...updateQuery,
    credits: { $gte: creditsToDeduct }
  },
  { 
    $inc: { credits: -creditsToDeduct },
    $push: { 
      pendingTransactions: { 
        id: transactionId, 
        credits: creditsToDeduct,
        timestamp: new Date()
      } 
    }
  },
  { new: true }
);

try {
  const response = await fetch(endpoint, { ... });
  if (!response.ok) {
    throw new Error('Generation failed');
  }
  
  const data = await response.json();
  const imageUrls = extractImageUrls(data);
  
  if (imageUrls.length === 0) {
    throw new Error('No images generated');
  }
  
  // Remove from pending if successful
  await User.findOneAndUpdate(
    updateQuery,
    { 
      $pull: { pendingTransactions: { id: transactionId } },
      $inc: { totalCreditsSpent: creditsToDeduct }
    }
  );
  
  res.json({ success: true, images: imageUrls, remainingCredits: updateResult.credits });
} catch (error) {
  // Rollback credits
  await User.findOneAndUpdate(
    updateQuery,
    { 
      $inc: { credits: creditsToDeduct },
      $pull: { pendingTransactions: { id: transactionId } }
    }
  );
  throw error;
}
```

---

### Priority 2: Improve Optimistic UI Updates

```javascript
// Only update optimistically if we're confident
// Always refresh after operation completes
const handleGenerate = async () => {
  // Don't update optimistically - wait for backend
  // Or update optimistically but always refresh after
  
  try {
    const result = await generateImage(...);
    
    // Always refresh credits from backend response
    if (result.remainingCredits !== undefined) {
      updateCredits(result.remainingCredits);
    } else {
      // If no remainingCredits in response, refresh manually
      await refreshCredits();
    }
  } catch (error) {
    // Always refresh on error to ensure correct value
    await refreshCredits();
    throw error;
  }
};
```

---

### Priority 3: Coordinate Refresh Intervals

```javascript
// Create a shared credit refresh service
class CreditRefreshService {
  constructor() {
    this.refreshInterval = null;
    this.subscribers = new Set();
  }
  
  subscribe(callback) {
    this.subscribers.add(callback);
    if (!this.refreshInterval) {
      this.start();
    }
  }
  
  unsubscribe(callback) {
    this.subscribers.delete(callback);
    if (this.subscribers.size === 0) {
      this.stop();
    }
  }
  
  start() {
    this.refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.subscribers.forEach(callback => callback());
      }
    }, 15000);
  }
  
  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// Use in both contexts
const creditRefresh = new CreditRefreshService();
```

---

## 🧪 Testing Checklist

- [ ] Credits display correctly on initial load
- [ ] Credits update correctly after generation
- [ ] Credits are refunded if generation fails (after fix)
- [ ] Credits sync correctly across devices
- [ ] Credits refresh correctly after purchase
- [ ] Credits display correctly when switching auth methods
- [ ] Credits don't go negative
- [ ] Credits update correctly on mobile browsers
- [ ] Credits refresh correctly when tab becomes visible
- [ ] Credits display correctly when API is slow
- [ ] Concurrent generation requests don't cause race conditions
- [ ] Payment history is accurate
- [ ] Subscription credits are calculated correctly
- [ ] NFT holder bonuses are applied correctly

---

## 📈 Summary

**Total Issues Found: 6**
- **Critical:** 3 (Credit deduction timing, No refund on failure, Optimistic UI updates)
- **High:** 3 (Race conditions, Multiple refresh intervals, Credit refresh reliability)

**Positive Findings:**
- ✅ Atomic credit operations
- ✅ Comprehensive validation
- ✅ Payment history tracking
- ✅ Consistent subscription credit calculation

**Estimated Fix Time:**
- Critical fixes: 6-8 hours
- High priority fixes: 3-4 hours
- Testing: 3-4 hours
- **Total: 12-16 hours**

**Recommended Action:** 
1. **IMMEDIATE:** Fix credit deduction timing (Priority 1)
2. **URGENT:** Implement refund mechanism or move deduction after generation
3. **HIGH:** Improve optimistic UI updates
4. **MEDIUM:** Coordinate refresh intervals
5. **LOW:** Standardize credit display format

---

## 📝 Notes

- The credit system is well-structured overall
- Main issues are around error handling and timing
- Most critical issue is credit loss on failed generations
- Frontend validation and display are generally good
- Backend atomic operations prevent most race conditions
- Payment history provides good audit trail

---

**Audit Completed:** 2025-01-24  
**Next Review:** After critical fixes are implemented

