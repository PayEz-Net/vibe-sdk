# Configuration

Complete configuration guide for Vibe SDK.

---

## Environment Variables

### IDP Proxy Mode (Recommended)

```bash
# IDP Proxy URL
IDP_URL=https://idp.payez.net
NEXT_PUBLIC_IDP_URL=https://idp.payez.net  # For client-side

# Vibe Client ID
VIBE_CLIENT_ID=vibe_abc123
NEXT_PUBLIC_VIBE_CLIENT_ID=vibe_abc123

# HMAC Signing Key (base64-encoded)
VIBE_HMAC_KEY=dGhpcy1pcy1hLWJhc2U2NC1lbmNvZGVkLWtleQ==
IDP_SIGNING_KEY=dGhpcy1pcy1hLWJhc2U2NC1lbmNvZGVkLWtleQ==  # Legacy name
```

### Direct API Mode (Legacy)

```bash
# Vibe API URL
VIBE_API_URL=https://vibe.yoursite.com
NEXT_PUBLIC_VIBE_API_URL=https://vibe.yoursite.com

# Client credentials
VIBE_CLIENT_ID=your_client_id
VIBE_CLIENT_SECRET=your_secret
```

### Optional Settings

```bash
# Default collection name
VIBE_COLLECTION=vibe_app
```

---

## Next.js Plugin Options

```javascript
// next.config.js
const withVibe = require('@vibe/next-plugin');

module.exports = withVibe({
  // Your Next.js config
  reactStrictMode: true,
}, {
  // Vibe plugin options

  // IDP proxy URL (optional, uses env var if not set)
  idpUrl: 'https://idp.payez.net',

  // Client ID (optional, uses env var if not set)
  clientId: 'vibe_abc123',

  // HMAC signing key (optional, uses env var if not set)
  signingKey: 'base64-encoded-key',

  // Output directory for generated types
  // Default: 'node_modules/.vibe/types'
  outputDir: './types/vibe',

  // Specific collections to generate (optional)
  // Default: all collections
  collections: ['products', 'users'],

  // Enable/disable dev watcher (hot-reload)
  // Default: true
  devSync: true,

  // Poll interval in milliseconds
  // Default: 10000 (10 seconds)
  pollInterval: 5000,

  // Enable debug logging
  // Default: false
  debug: true,
});
```

---

## Client Configuration

### Runtime Configuration

```typescript
import { createVibeClient } from '@vibe/client';

const vibe = createVibeClient({
  // API URL (IDP proxy or direct)
  apiUrl: 'https://idp.payez.net',

  // Get access token for authenticated requests
  getAccessToken: async () => {
    const session = await getSession();
    return session?.accessToken || null;
  },

  // Enable debug logging
  debug: true,

  // IDP proxy mode (default: true if idpUrl set)
  useIdpProxy: true,

  // HMAC signing key (for IDP proxy)
  signingKey: 'base64-encoded-key',

  // Client ID
  clientId: 'vibe_abc123',
});
```

### React Provider Configuration

```typescript
import { configureVibeClient } from '@vibe/client/react';

configureVibeClient({
  apiUrl: process.env.NEXT_PUBLIC_IDP_URL,
  getAccessToken: async () => {
    const session = await getSession();
    return session?.accessToken || null;
  },
  debug: process.env.NODE_ENV === 'development',
});
```

---

## Hot-Reload Configuration

### Adjusting Poll Interval

Default is 10 seconds. Adjust based on your needs:

```javascript
// Faster polling (5 seconds)
module.exports = withVibe(config, {
  pollInterval: 5000,
});

// Slower polling (30 seconds) - less load
module.exports = withVibe(config, {
  pollInterval: 30000,
});
```

### Disabling Hot-Reload

For production builds or when you want manual control:

```javascript
module.exports = withVibe(config, {
  devSync: false,  // Disable automatic polling
});
```

Then use CLI for manual sync:

```bash
npx vibe sync
```

---

## Type Generation Configuration

### Custom Output Directory

```javascript
module.exports = withVibe(config, {
  outputDir: './src/types/vibe',
});
```

Then update your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@vibe/types": ["./src/types/vibe"]
    }
  }
}
```

### Specific Collections Only

Generate types for only specific collections:

```javascript
module.exports = withVibe(config, {
  collections: ['products', 'users', 'orders'],
});
```

---

## Authentication Configuration

### HMAC Signing

HMAC signatures are generated as:

```
stringToSign = "{timestamp}|{method}|{endpoint}"
signature = HMAC-SHA256(signingKey, stringToSign) [base64]
```

**Required headers sent automatically:**
- `X-Vibe-Client-Id` - Your client ID
- `X-Vibe-Timestamp` - Unix timestamp (seconds)
- `X-Vibe-Signature` - HMAC-SHA256 signature
- `Authorization` - Bearer token (if getAccessToken provided)

### Bearer Token

Provide access token via `getAccessToken`:

```typescript
createVibeClient({
  getAccessToken: async () => {
    // Return null for unauthenticated requests
    if (!authenticated) return null;

    // Return token for authenticated requests
    return session?.accessToken || null;
  },
});
```

---

## Debug Mode

Enable debug logging to see what's happening:

```javascript
// Next.js plugin debug
module.exports = withVibe(config, {
  debug: true,
});
```

```typescript
// Client debug
const vibe = createVibeClient({
  debug: true,
});
```

**Debug output includes:**
- Type generation progress
- Schema hash checks
- API requests/responses
- HMAC signature generation
- Error details

---

## Configuration Precedence

Settings are resolved in this order (highest to lowest):

1. **Inline config** (passed to function)
2. **Environment variables**
3. **Defaults**

Example:

```typescript
// 1. Inline wins
createVibeClient({
  apiUrl: 'https://custom.api.com',  // ← Used
});

// 2. Env var if no inline
process.env.IDP_URL = 'https://idp.payez.net';  // ← Used if no inline

// 3. Default if neither
// Default: localhost (dev mode)
```

---

## Production Recommendations

```javascript
// next.config.js (production)
module.exports = withVibe(config, {
  // Use env vars, don't hardcode
  // idpUrl: process.env.IDP_URL,

  // Disable dev watcher in production
  devSync: process.env.NODE_ENV === 'development',

  // No debug logging in production
  debug: false,

  // Generate all collections
  collections: undefined,
});
```

```typescript
// Client configuration (production)
createVibeClient({
  apiUrl: process.env.NEXT_PUBLIC_IDP_URL,
  getAccessToken: async () => session?.accessToken || null,
  debug: false,
});
```

---

## Troubleshooting Configuration

### "No API configuration" warning

**Cause:** Neither `IDP_URL` nor `VIBE_API_URL` is set

**Fix:**
```bash
IDP_URL=https://idp.payez.net
```

### "VIBE_CLIENT_ID not set" warning

**Cause:** Client ID missing

**Fix:**
```bash
VIBE_CLIENT_ID=vibe_your_client_id
```

### "VIBE_HMAC_KEY not set" warning

**Cause:** HMAC key missing (IDP proxy mode)

**Fix:**
```bash
VIBE_HMAC_KEY=your_base64_encoded_key
```

### Types not generating

**Check:**
1. Environment variables are set correctly
2. `withVibe()` is wrapping your Next.js config
3. Dev server is running
4. `node_modules/.vibe/types/` directory exists

**Debug:**
```bash
npx vibe sync --debug
```

### Authentication errors (401/403)

**Check:**
1. HMAC key is correct and base64-encoded
2. Client ID matches server configuration
3. `getAccessToken()` is returning valid token
4. Clock skew (server time vs client time)

---

## Example: Complete Setup

```javascript
// next.config.js
const withVibe = require('@vibe/next-plugin');

module.exports = withVibe({
  reactStrictMode: true,
  swcMinify: true,
}, {
  pollInterval: 10000,
  devSync: process.env.NODE_ENV === 'development',
  debug: false,
});
```

```bash
# .env.local
IDP_URL=https://idp.payez.net
VIBE_CLIENT_ID=vibe_abc123
VIBE_HMAC_KEY=dGhpcy1pcy1hLWJhc2U2NC1rZXk=

NEXT_PUBLIC_IDP_URL=https://idp.payez.net
NEXT_PUBLIC_VIBE_CLIENT_ID=vibe_abc123
```

```typescript
// app/providers.tsx
'use client';

import { configureVibeClient } from '@vibe/client/react';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export function VibeProvider({ children }) {
  const { data: session } = useSession();

  useEffect(() => {
    configureVibeClient({
      getAccessToken: async () => session?.accessToken || null,
    });
  }, [session?.accessToken]);

  return <>{children}</>;
}
```

**That's it!** Types generate automatically, hot-reload works, full type safety everywhere.
