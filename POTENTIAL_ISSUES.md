# Potential Issues with Credits Display

## Critical Issues Found:

### 1. **Existing User Documents Missing `totalCreditsEarned` Field**
**Problem**: If user documents were created before the `totalCreditsEarned` field was added to the schema, they may not have this field at all.

**Impact**: 
- MongoDB schema defaults (`default: 0`) only apply to NEW documents
- Old documents might have `undefined` or `null` for `totalCreditsEarned`
- `$inc` should create the field, but if a user connects before grants, the field might be missing

**Fix Needed**: Migration script to add missing fields to existing documents

### 2. **Race Condition Between Grant Script and User Connection**
**Problem**: If a user connects their wallet BEFORE credits are granted:
- `getOrCreateUser` creates user with `totalCreditsEarned: 0`
- Grant script later uses `$inc` which should work, but there's a timing window

**Impact**: Very minimal - `$inc` handles missing fields correctly

### 3. **MongoDB `$inc` on Non-Existent Field**
**Problem**: If `totalCreditsEarned` doesn't exist in document, `$inc` will:
- Create the field and set it to the incremented value
- But if the field is `null`, `$inc` treats it as 0

**Impact**: Should work, but worth verifying

### 4. **Address Normalization Timing**
**Problem**: 
- Grant script normalizes to lowercase
- Frontend normalizes to lowercase
- But if grant script runs with mixed case and saves, then API queries with lowercase might not find it

**Impact**: Fixed in latest changes, but verify database has correct format

### 5. **Frontend Cache Issues**
**Problem**: Browser cache might have stale data even after refresh

**Impact**: Fixed with aggressive cache clearing, but users might need to hard refresh

### 6. **Null vs Undefined vs Missing Field**
**Problem**: MongoDB can have:
- Field doesn't exist: `undefined` when accessed
- Field is `null`: explicit null value
- Field is `0`: actual zero value

**Impact**: Our `!= null` check should handle this, but need to verify

## Most Likely Issue:

**Existing documents missing the `totalCreditsEarned` field entirely.**

If a user was created before this field existed, the document might not have it at all. When the API tries to read it, it gets `undefined`, and our `!= null` check converts it to 0.

## Recommended Fix:

Create a migration script to ensure all existing user documents have `totalCreditsEarned` field initialized.

