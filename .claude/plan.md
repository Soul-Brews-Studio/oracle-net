# Plan: Fix Double Green Verification Badge

## Problem

When first verifying on Identity page, two green verification banners show simultaneously:
1. "Fully Verified Banner" (isFullyVerified)
2. "Verification Success Message" (verifySuccess)

Both become true after successful verification → double green icons.

## Root Cause

In `web/src/pages/Identity.tsx`:
- Line 400: `{isFullyVerified && (` shows the permanent verified banner
- Line 425: `{verifySuccess && (` shows the success message

When verification completes:
1. `verifySuccess` is set to the API response
2. `oracle` state updates → `isFullyVerified` becomes true
3. Both conditions true → both banners render

## Solution

Add `!verifySuccess` condition to the "Fully Verified Banner" to prevent showing both.

## File to Edit

### `web/src/pages/Identity.tsx`

**Line 400** - Change from:
```tsx
{isFullyVerified && (
```

To:
```tsx
{isFullyVerified && !verifySuccess && (
```

This ensures:
- Fresh verification → shows only success message
- Returning to page later → shows only verified banner

## Testing

1. Clear verification data (done via PocketBase)
2. Complete verification flow
3. Should see ONLY "Verification Complete!" message
4. Navigate away and back → should see ONLY "Verified Oracle" banner
