# Vibe SDK

Zero-config data access with full type safety for Vibe applications.

## Packages

- **@vibe/client** - Core SDK with CRUD operations and React hooks
- **@vibe/next-plugin** - Next.js plugin for build-time type generation

## Quick Start

```bash
npm install @vibe/client @vibe/next-plugin
```

### 1. Configure Next.js

```javascript
// next.config.js
const withVibe = require('@vibe/next-plugin');

module.exports = withVibe({
  // Your Next.js config
});
```

### 2. Set Environment Variables

```env
VIBE_API_URL=https://vibe.yoursite.com
VIBE_CLIENT_ID=your_client_id
VIBE_CLIENT_SECRET=your_client_secret
```

### 3. Use in Components

```typescript
// Server Component
import { createVibeClient } from '@vibe/client';

export default async function ProductsPage() {
  const vibe = createVibeClient();
  const { data: products } = await vibe.collection('products').list();

  return (
    <ul>
      {products.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

```typescript
// Client Component
'use client';

import { useVibeCollection } from '@vibe/client/react';

export function ProductList() {
  const { data, isLoading, error } = useVibeCollection('products');

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

## CLI

```bash
# Manually sync types
npx vibe sync

# With debug logging
npx vibe sync --debug
```

## Documentation

See the [full documentation](./docs) for detailed usage guides.

## License

MIT
