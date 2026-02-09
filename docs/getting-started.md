# Getting Started with Vibe SDK

Get from zero to typed queries in 5 minutes.

---

## Prerequisites

- Next.js 14+ project
- VibeSQL database (Micro or Server)
- Node.js 18+

---

## Step 1: Install Packages

```bash
npm install @vibe/client @vibe/next-plugin
```

---

## Step 2: Configure Next.js Plugin

Add the Vibe plugin to your `next.config.js`:

```javascript
// next.config.js
const withVibe = require('@vibe/next-plugin');

module.exports = withVibe({
  // Your existing Next.js config
  reactStrictMode: true,
});
```

---

## Step 3: Set Environment Variables

Create `.env.local`:

```bash
# IDP Proxy Mode (Recommended)
IDP_URL=https://idp.payez.net
VIBE_CLIENT_ID=vibe_your_client_id
VIBE_HMAC_KEY=your_base64_hmac_key

# OR Direct API Mode (Legacy)
VIBE_API_URL=https://vibe.yoursite.com
VIBE_CLIENT_ID=your_client_id
VIBE_CLIENT_SECRET=your_secret
```

---

## Step 4: Configure Vibe Client Provider

Wrap your app to provide authentication:

```typescript
// app/providers.tsx
'use client';

import { configureVibeClient } from '@vibe/client/react';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export function VibeProvider({ children }: { children: React.Node }) {
  const { data: session } = useSession();

  useEffect(() => {
    configureVibeClient({
      getAccessToken: async () => session?.accessToken || null,
    });
  }, [session?.accessToken]);

  return <>{children}</>;
}
```

```typescript
// app/layout.tsx
import { SessionProvider } from 'next-auth/react';
import { VibeProvider } from './providers';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <SessionProvider>
          <VibeProvider>
            {children}
          </VibeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
```

---

## Step 5: Your First Query

### Server Component

```typescript
// app/products/page.tsx
import { createVibeClient } from '@vibe/client';

export default async function ProductsPage() {
  const vibe = createVibeClient();
  const { data: products } = await vibe.collection('products').list();

  return (
    <div>
      <h1>Products</h1>
      <ul>
        {products.map(product => (
          <li key={product.id}>
            {product.name} - ${product.price}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Client Component

```typescript
// app/products/client.tsx
'use client';

import { useVibeCollection } from '@vibe/client/react';

export function ProductList() {
  const { data: products, isLoading, error } = useVibeCollection('products');

  if (isLoading) return <div>Loading products...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {products?.map(product => (
        <li key={product.id}>
          {product.name} - ${product.price}
        </li>
      ))}
    </ul>
  );
}
```

---

## Step 6: Watch the Magic

**Start your dev server:**

```bash
npm run dev
```

**What happens automatically:**

1. ✅ Vibe plugin polls your VibeSQL schema every 10 seconds
2. ✅ Generates TypeScript types to `node_modules/.vibe/types/`
3. ✅ Touches `tsconfig.json` to reload TypeScript server
4. ✅ Your editor gets full type safety instantly
5. ✅ Change your VibeSQL schema → Types update automatically

**No build step. No commands. It just works.**

---

## What You Get

### Full Type Safety

```typescript
const { data } = await vibe.collection('products').list();
// 'data' is typed as Product[] from your VibeSQL schema
// TypeScript knows: data[0].name, data[0].price, data[0].id

const product = await vibe.collection('products').get(123);
// product.name ✅ (autocomplete works!)
// product.xyz ❌ (TypeScript error - field doesn't exist)
```

### CRUD Operations

```typescript
// List with pagination
const { data, pagination } = await vibe.collection('products').list({
  limit: 20,
  offset: 0,
  orderBy: 'created_at',
  orderDir: 'desc',
});

// Get single item
const product = await vibe.collection('products').get(123);

// Create
const newProduct = await vibe.collection('products').create({
  name: 'New Product',
  price: 29.99,
});

// Update
await vibe.collection('products').update(123, {
  price: 19.99,
});

// Delete
await vibe.collection('products').delete(123);
```

### React Hooks

```typescript
// List hook with auto-refetch
const { data, isLoading, refetch } = useVibeCollection('products');

// Single item hook
const { data: product } = useVibeDocument('products', productId);

// Mutation hooks with auto-invalidation
const create = useVibeCreate('products');
const update = useVibeUpdate('products');
const remove = useVibeDelete('products');

await create.mutateAsync({ name: 'Product', price: 29.99 });
// ✅ List query automatically refetches!
```

---

## Next Steps

- [Configuration Guide](./configuration.md) — Environment variables, polling intervals, output directories
- [API Reference](./api-reference.md) — Complete API documentation
- [Examples](./examples/) — Real-world usage patterns
- [Architecture](./architecture.md) — How hot-reload works under the hood

---

## Troubleshooting

**Types not generating?**
- Check environment variables are set correctly
- Run `npx vibe sync --debug` to see what's happening
- Check `node_modules/.vibe/types/` exists

**Authentication errors?**
- Verify `VIBE_HMAC_KEY` is base64-encoded
- Check `IDP_URL` is reachable
- Try dev mode: Set `VibeSQL:DevBypassHmac=true` on server

**Types not updating after schema change?**
- Wait 10 seconds (default poll interval)
- Check server logs for schema hash changes
- Manually sync: `npx vibe sync`

---

**You're ready!** The ORM is now invisible infrastructure that just works.
