# TypeScript Migration Checklist

Quick reference for tracking conversion progress.

## Files Remaining

### Routes
- [ ] `routes/generate.js` → `routes/generate.ts`
- [ ] `routes/wan-animate.js` → `routes/wan-animate.ts`

### Other
- [ ] `abusePrevention.js` → `abusePrevention.ts` (optional - may stay as JS)

## Conversion Steps (Per File)

1. [ ] Copy `.js` file to `.ts` file
2. [ ] Add TypeScript imports (`type Request, type Response`)
3. [ ] Define `Dependencies` interface
4. [ ] Type function signature: `(deps: Dependencies = {})`
5. [ ] Type route handlers: `async (req: Request, res: Response)`
6. [ ] Type request bodies: `req.body as { ... }`
7. [ ] Remove `.js` from import paths
8. [ ] Run `npx tsc --noEmit` to check for errors
9. [ ] Test endpoints manually
10. [ ] Update `routes/index.ts` if needed
11. [ ] Delete old `.js` file (after verification)
12. [ ] Update this checklist

## Quick Reference

### Import Pattern
```typescript
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
```

### Dependencies Interface
```typescript
interface Dependencies {
  [key: string]: any; // Or specific types
}
```

### Route Handler
```typescript
router.post('/path', middleware, async (req: Request, res: Response) => {
  const { field } = req.body as { field?: string };
  // ...
});
```

## See Also

- `REWRITE_GUIDE.md` - Detailed conversion guide
- `routes/auth.ts` - Reference implementation

