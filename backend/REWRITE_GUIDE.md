# TypeScript Migration Guide for AI Agents

This guide helps AI agents continue the JavaScript-to-TypeScript migration of the backend codebase.

## Current Status

### ✅ Completed (TypeScript)
- `config/` - All files converted
- `middleware/` - All files converted
- `services/` - All files converted
- `models/` - All files converted
- `utils/` - All files converted
- `routes/auth.ts` - ✅ Converted
- `routes/user.ts` - ✅ Converted
- `routes/admin.ts` - ✅ Converted
- `routes/gallery.ts` - ✅ Converted
- `routes/extract.ts` - ✅ Converted
- `routes/rpc.ts` - ✅ Converted
- `routes/payments.ts` - ✅ Converted
- `routes/stripe.ts` - ✅ Converted
- `routes/utility.ts` - ✅ Converted
- `routes/health.ts` - ✅ Converted
- `routes/static.ts` - ✅ Converted
- `routes/index.ts` - ✅ Converted
- `server-modular.ts` - ✅ Converted

### ⚠️ Needs Conversion (JavaScript)
- `routes/generate.js` → `routes/generate.ts`
- `routes/wan-animate.js` → `routes/wan-animate.js`
- `abusePrevention.js` → `abusePrevention.ts` (if needed)

### 📝 Scripts (Keep as JS)
- `scripts/*.js` - Keep as JavaScript (admin/utility scripts)

## Conversion Pattern

### 1. File Structure Template

```typescript
/**
 * [Module description]
 * [Brief description of what this module does]
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
// ... other imports

// Types
interface Dependencies {
  // List all dependencies from deps parameter
  [key: string]: any;
}

interface RequestBody {
  // Define request body types
  [key: string]: any;
}

export function create[Module]Routes(deps: Dependencies = {}) {
  const router = Router();
  // Extract dependencies with defaults
  const { dependency1, dependency2 } = deps;

  /**
   * [Route description]
   * [HTTP Method] /api/[path]
   */
  router.[method]('/[path]', [middleware], async (req: Request, res: Response) => {
    try {
      // Implementation
    } catch (error) {
      // Error handling
    }
  });

  return router;
}
```

### 2. Key Conversion Steps

1. **Add Type Imports**
   ```typescript
   import { Router, type Request, type Response } from 'express';
   import type { RequestHandler } from 'express';
   ```

2. **Define Dependencies Interface**
   ```typescript
   interface Dependencies {
     rateLimiter?: RequestHandler;
     requireCredits?: RequestHandler;
     authenticateToken?: RequestHandler;
     // ... other dependencies
   }
   ```

3. **Type Function Parameters**
   ```typescript
   export function createRoutes(deps: Dependencies = {}) {
     // ...
   }
   ```

4. **Type Request/Response Handlers**
   ```typescript
   router.post('/path', middleware, async (req: Request, res: Response) => {
     const { field1, field2 } = req.body as { field1?: string; field2?: number };
     // ...
   });
   ```

5. **Update Import Paths**
   - Remove `.js` extensions from imports (TypeScript handles this)
   - Example: `'../utils/logger.js'` → `'../utils/logger'`

6. **Add Type Assertions for req.body**
   ```typescript
   const { email, password } = req.body as { email?: string; password?: string };
   ```

### 3. Reference Implementation

See `routes/auth.ts` as the reference implementation. It demonstrates:
- Proper type definitions
- Dependency injection typing
- Request/Response typing
- Error handling patterns
- Import organization

## Files to Convert

### Priority 1: `routes/generate.js`

**Key Dependencies:**
- `freeImageRateLimiter` (RequestHandler)
- `requireCreditsForModel` (function returning RequestHandler)
- `requireCreditsForVideo` (function returning RequestHandler)
- `requireCredits` (RequestHandler)

**Key Types Needed:**
- Image generation request body
- Video generation request body
- Music generation request body
- Queue status response

**Conversion Checklist:**
- [ ] Add TypeScript imports with types
- [ ] Define `Dependencies` interface
- [ ] Type all route handlers
- [ ] Type request bodies
- [ ] Remove `.js` from import paths
- [ ] Add proper error types
- [ ] Test all endpoints

### Priority 2: `routes/wan-animate.js`

**Key Dependencies:**
- `wanSubmitLimiter` (RequestHandler)
- `wanStatusLimiter` (RequestHandler)
- `wanResultLimiter` (RequestHandler)
- `requireCredits` (RequestHandler)
- `authenticateToken` (RequestHandler)

**Key Types Needed:**
- Video upload request body
- Image upload request body
- Submit request body
- Status/Result response types

**Conversion Checklist:**
- [ ] Add TypeScript imports with types
- [ ] Define `Dependencies` interface
- [ ] Type all route handlers
- [ ] Type file upload handling
- [ ] Type FAL API responses
- [ ] Remove `.js` from import paths
- [ ] Add proper error types
- [ ] Test all endpoints

## Common Patterns

### Pattern 1: Route with Authentication
```typescript
router.post('/path', authenticateToken, async (req: Request, res: Response) => {
  const user = req.user; // Typed by middleware
  // ...
});
```

### Pattern 2: Route with Rate Limiting
```typescript
router.post('/path', rateLimiter, async (req: Request, res: Response) => {
  // ...
});
```

### Pattern 3: Route with Credits Check
```typescript
router.post('/path', requireCreditsForModel(), async (req: Request, res: Response) => {
  const creditsRequired = req.creditsRequired || 1;
  // ...
});
```

### Pattern 4: Error Handling
```typescript
try {
  // Implementation
} catch (error) {
  logger.error('Operation failed', { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
}
```

## Import Path Updates

When converting, update these import patterns:

**Before (JS):**
```javascript
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { buildUserUpdateQuery } from '../services/user.js';
```

**After (TS):**
```typescript
import logger from '../utils/logger';
import config from '../config/env';
import { buildUserUpdateQuery } from '../services/user';
```

## Type Definitions Reference

### Express Types
```typescript
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
```

### Mongoose Types
```typescript
import mongoose from 'mongoose';
const User = mongoose.model('User');
// User is automatically typed if model is defined in TypeScript
```

### Model Types
```typescript
import type { IUser } from '../models/User';
```

## Testing After Conversion

1. **Compile Check**
   ```bash
   cd backend
   npx tsc --noEmit
   ```

2. **Runtime Test**
   ```bash
   npm run dev
   ```

3. **Verify Endpoints**
   - Test each route endpoint
   - Check error handling
   - Verify middleware integration

## Common Issues & Solutions

### Issue 1: Import Path Errors
**Problem:** TypeScript can't resolve imports with `.js` extension
**Solution:** Remove `.js` from all import paths

### Issue 2: Missing Type Definitions
**Problem:** `req.body` is `any` type
**Solution:** Use type assertion: `req.body as { field: type }`

### Issue 3: Middleware Types
**Problem:** Middleware functions not typed
**Solution:** Use `RequestHandler` type from express

### Issue 4: Mongoose Model Types
**Problem:** Model methods not typed
**Solution:** Models are auto-typed if defined in TypeScript. For JS models, use type assertions.

## Next Steps After Conversion

1. Update `routes/index.ts` to import from `.ts` files
2. Verify `server-modular.ts` imports are correct
3. Run TypeScript compiler to check for errors
4. Test all endpoints
5. Update this guide to mark files as complete

## Notes for AI Agents

- Always preserve the original functionality
- Don't change business logic, only add types
- Follow the patterns in `routes/auth.ts`
- Test thoroughly after conversion
- Update this guide when files are converted
- Keep JavaScript files until TypeScript version is verified working

