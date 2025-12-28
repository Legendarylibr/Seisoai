# Credit Functionality and Display Audit

**Date:** 2025-01-23  
**Status:** Issues Identified - Fixes Required

## Executive Summary

This audit identifies several critical issues in the credit system that can cause:
1. Credits not displaying correctly
2. Credits being deducted incorrectly
3. Credits not syncing across devices
4. Credits being lost when generation fails

---

## 🔴 Critical Issues

### 1. **Credit Deduction Happens Before Generation (No Rollback)**

**Location:** `backend/server.js:1825-1870`

**Problem:**
- Credits are deducted IMMEDIATELY when the request arrives (line 1841-1850)
- If image generation fails AFTER credits are deducted, credits are NOT refunded
- User loses credits even if no image was generated

**Code:**
```javascript
// Credits deducted BEFORE generation
const updateResult = await User.findOneAndUpdate(
  { ...updateQuery, credits: { $gte: creditsToDeduct } },
  { $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } },
  { new: true }
);

// Then generation happens (can fail)
// If it fails, credits are already gone - NO REFUND
```

**Impact:** Users lose credits when generation fails due to API errors, network issues, or service outages.

**Fix Required:** Implement rollback mechanism or deduct credits AFTER successful generation.

---

### 2. **Optimistic UI Update Can Show Wrong Credits**

**Location:** `src/components/GenerateButton.jsx:170-178`

**Problem:**
- Frontend optimistically deducts credits BEFORE backend confirms
- If backend fails or rejects, frontend still shows reduced credits
- Credits refresh happens in catch block, but might not always work

**Code:**
```javascript
// Optimistically update UI for instant feedback
const currentCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
const newCredits = Math.max(0, currentCredits - creditsToDeduct);

if (isEmailAuth && emailContext.setCreditsManually) {
  emailContext.setCreditsManually(newCredits); // Updates UI immediately
} else if (!isEmailAuth && setCreditsManually) {
  setCreditsManually(newCredits); // Updates UI immediately
}

// If generation fails, credits are refreshed in catch block
// But if refresh fails, UI shows wrong value
```

**Impact:** Users see incorrect credit balance if generation fails or refresh fails.

**Fix Required:** Only update UI optimistically if we're confident the backend will succeed, or always refresh after operation.

---

### 3. **Race Condition Between Email and Wallet Contexts**

**Location:** `src/components/Navigation.jsx:18-24`

**Problem:**
- Both `EmailAuthContext` and `SimpleWalletContext` can be active simultaneously
- Credits are selected based on `isEmailAuth`, but both contexts might be fetching
- If user switches between auth methods, credits might flicker or show wrong value

**Code:**
```javascript
const credits = isEmailAuth 
  ? (typeof emailContext.credits === 'number' ? emailContext.credits : 0)
  : (typeof walletContext.credits === 'number' ? walletContext.credits : 0);
```

**Impact:** Credits might not display correctly when switching between auth methods or if both contexts are active.

**Fix Required:** Ensure only one context is active at a time, or properly handle both contexts being active.

---

### 4. **Multiple Refresh Intervals Can Cause Race Conditions**

**Location:** 
- `src/contexts/EmailAuthContext.jsx:240-245` (15 second interval)
- `src/contexts/SimpleWalletContext.jsx:523-528` (15 second interval)

**Problem:**
- Both contexts refresh credits every 15 seconds independently
- If both are active, two refresh requests happen simultaneously
- Can cause race conditions or unnecessary API calls

**Code:**
```javascript
// EmailAuthContext
const refreshInterval = setInterval(() => {
  if (document.visibilityState === 'visible') {
    safeFetchUserData(); // Fetches credits
  }
}, 15000);

// SimpleWalletContext
const refreshInterval = setInterval(() => {
  if (document.visibilityState === 'visible') {
    fetchCredits(address, 3, true).catch(() => {}); // Fetches credits
  }
}, 15000);
```

**Impact:** Unnecessary API calls, potential race conditions, inconsistent credit display.

**Fix Required:** Coordinate refresh intervals or use a single shared refresh mechanism.

---

## ⚠️ Medium Priority Issues

### 5. **Credit Refresh Not Always Called After Operations**

**Location:** Multiple locations

**Problem:**
- After successful generation, credits are updated from `remainingCredits` in response
- But if response doesn't include `remainingCredits`, credits aren't refreshed
- Some operations don't refresh credits at all

**Examples:**
- `src/components/GenerateButton.jsx:228-234` - Only updates if `remainingCredits` exists
- `src/components/ImageOutput.jsx:437-438` - Only updates if `remainingCredits` exists

**Impact:** Credits might not update if backend response format changes or is missing.

**Fix Required:** Always refresh credits after operations, regardless of response format.

---

### 6. **Error Handling Doesn't Always Restore Credits**

**Location:** `src/components/GenerateButton.jsx:281-293`

**Problem:**
- When generation fails, credits are refreshed in catch block
- But if refresh fails, credits stay at wrong value
- No guarantee that credits are restored to correct value

**Code:**
```javascript
} catch (error) {
  // Refresh credits after error
  try {
    if (isEmailAuth && emailContext.refreshCredits) {
      await emailContext.refreshCredits();
    } else if (!isEmailAuth && refreshCredits && address) {
      await refreshCredits();
    }
  } catch (refreshError) {
    // Ignore refresh errors - credits might be wrong now
  }
}
```

**Impact:** If refresh fails, user sees incorrect credit balance.

**Fix Required:** Implement retry mechanism or show error to user if refresh fails.

---

### 7. **Cache-Busting Might Not Work on All Browsers**

**Location:** 
- `src/contexts/EmailAuthContext.jsx:65-66`
- `src/contexts/SimpleWalletContext.jsx:97-98`

**Problem:**
- Cache-busting uses query parameters (`?t=${Date.now()}`)
- Some browsers might still cache despite `cache: 'no-store'`
- Mobile browsers are especially aggressive with caching

**Code:**
```javascript
const cacheBuster = `t=${Date.now()}`;
const url = `${API_URL}/api/auth/me?${cacheBuster}`;
```

**Impact:** Credits might not update on some browsers, especially mobile.

**Fix Required:** Use stronger cache-busting or ensure backend headers are properly set (already done, but verify).

---

### 8. **No Validation of Credit Values from Backend**

**Location:** 
- `src/contexts/EmailAuthContext.jsx:108-116`
- `src/contexts/SimpleWalletContext.jsx:128-136`

**Problem:**
- Credits are converted to numbers but not validated
- Negative credits or extremely large numbers not caught
- Could cause display issues or security problems

**Code:**
```javascript
const credits = rawCredits != null ? Number(rawCredits) : 0;
// No validation that credits is reasonable (e.g., >= 0, < MAX_SAFE_INTEGER)
```

**Impact:** Invalid credit values could cause display issues or security problems.

**Fix Required:** Add validation to ensure credits are reasonable values.

---

## 📋 Low Priority Issues

### 9. **Inconsistent Credit Display Format**

**Location:** Multiple components

**Problem:**
- Some components show "X credits" (Navigation.jsx:283)
- Some show just the number (EmailUserInfo.jsx:54)
- Inconsistent formatting can confuse users

**Fix Required:** Standardize credit display format across all components.

---

### 10. **No Loading State for Credits**

**Location:** All credit display components

**Problem:**
- Credits show as 0 while loading
- No indication that credits are being fetched
- Users might think they have no credits when they're just loading

**Fix Required:** Show loading indicator while credits are being fetched.

---

## 🔧 Recommended Fixes

### Priority 1: Fix Credit Deduction Timing

**Option A: Deduct Credits After Generation (Recommended)**
```javascript
// Backend: Deduct credits AFTER successful generation
app.post('/api/generate/image', requireCreditsForModel(), async (req, res) => {
  // Check credits but don't deduct yet
  const user = req.user;
  if (user.credits < requiredCredits) {
    return res.status(400).json({ error: 'Insufficient credits' });
  }
  
  // Generate image first
  const imageResult = await generateImage(...);
  
  // Only deduct credits if generation succeeded
  if (imageResult.success) {
    await User.findOneAndUpdate(
      updateQuery,
      { $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } },
      { new: true }
    );
  }
  
  res.json({ images: imageResult.images, remainingCredits: ... });
});
```

**Option B: Implement Rollback Mechanism**
```javascript
// Deduct credits first, but store transaction ID
const transactionId = generateTransactionId();
await User.findOneAndUpdate(
  updateQuery,
  { 
    $inc: { credits: -creditsToDeduct },
    $push: { pendingTransactions: { id: transactionId, credits: creditsToDeduct } }
  }
);

try {
  const imageResult = await generateImage(...);
  // Remove from pending if successful
  await User.findOneAndUpdate(
    updateQuery,
    { $pull: { pendingTransactions: { id: transactionId } } }
  );
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

### Priority 2: Fix Optimistic UI Updates

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

### Priority 4: Add Credit Validation

```javascript
const validateCredits = (credits) => {
  const num = Number(credits);
  if (isNaN(num)) return 0;
  if (num < 0) return 0;
  if (num > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.floor(num); // Ensure integer
};

const credits = validateCredits(rawCredits);
```

---

## 🧪 Testing Checklist

- [ ] Credits display correctly on initial load
- [ ] Credits update correctly after generation
- [ ] Credits are refunded if generation fails
- [ ] Credits sync correctly across devices
- [ ] Credits refresh correctly after purchase
- [ ] Credits display correctly when switching auth methods
- [ ] Credits don't go negative
- [ ] Credits update correctly on mobile browsers
- [ ] Credits refresh correctly when tab becomes visible
- [ ] Credits display correctly when API is slow

---

## 📊 Summary

**Total Issues Found:** 10
- **Critical:** 4
- **Medium:** 4
- **Low:** 2

**Estimated Fix Time:**
- Critical fixes: 4-6 hours
- Medium fixes: 2-3 hours
- Low fixes: 1 hour
- Testing: 2-3 hours
- **Total: 9-13 hours**

**Recommended Action:** Fix critical issues first, then medium priority, then low priority.

