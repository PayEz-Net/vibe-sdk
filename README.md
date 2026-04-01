# Vibe SDK

**The ORM that disappears.** TypeScript data client for [VibeSQL](https://vibesql.online) with auto-generated types, React hooks, and a Next.js plugin that keeps your types in sync with your schema -- zero config.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## Features

- **Auto-generated TypeScript types** -- `@vibe/next-plugin` introspects your VibeSQL schema and writes `.d.ts` files at build time. Change a column, types update automatically.
- **Live hot-reload in dev** -- Polls your schema every 10 seconds. Add a table, types regenerate, TypeScript server reloads. No restart.
- **Full CRUD client** -- `list`, `get`, `create`, `update`, `delete` on any collection. Pagination, filtering, and ordering built in.
- **React hooks (TanStack Query)** -- `useVibeCollection`, `useVibeDocument`, `useVibeCreate`, `useVibeUpdate`, `useVibeDelete`. Automatic cache invalidation.
- **Admin hooks** -- `useVibeRoles`, `useVibeUsers`, `useVibeTenantConfig` for back-office UIs.
- **RBAC utilities** -- `hasRole`, `isAdmin`, `isPlatformAdmin`, `meetsRoleLevel` with a typed role hierarchy.
- **HMAC-signed auth** -- Requests signed with SHA-256 HMAC via Web Crypto (browser) or Node.js `crypto`. Works in both environments.
- **Dual transport** -- IDP proxy mode (recommended) or direct API mode. Same client API either way.
- **Dual module format** -- Ships ESM and CJS. Tree-shakeable. React hooks are an optional peer dependency.
- **CLI** -- `npx vibe sync` for on-demand type generation outside of Next.js.

---

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| `@payez/vibe-client` | `0.2.3` | Core client, React hooks, auth utilities |
| `@payez/vibe-next-plugin` | `0.1.1` | Next.js config wrapper, type generator, dev watcher, CLI |

The monorepo uses npm workspaces. `@payez/vibe-client` has **zero required dependencies** -- React and TanStack Query are optional peer deps.

---

## Quick Start

### 1. Install

```bash
npm install @payez/vibe-client @payez/vibe-next-plugin
```

### 2. Environment Variables

Create `.env.local` in your Next.js project:

```bash
# IDP Proxy mode (recommended)
IDP_URL=https://idp.yoursite.com
NEXT_PUBLIC_IDP_URL=https://idp.yoursite.com
VIBE_CLIENT_ID=vibe_abc123
VIBE_HMAC_KEY=your_base64_encoded_hmac_key

# -- OR -- Direct mode (legacy)
VIBE_API_URL=https://your-vibesql-server.com
NEXT_PUBLIC_VIBE_API_URL=https://your-vibesql-server.com
```

### 3. Wrap Your Next.js Config

```javascript
// next.config.js
const withVibe = require('@payez/vibe-next-plugin');

module.exports = withVibe({
  reactStrictMode: true,
});
```

Or with custom plugin options:

```javascript
const { createWithVibe } = require('@payez/vibe-next-plugin');

const withVibe = createWithVibe({
  collections: ['products', 'orders'],
  pollInterval: 5000,
  debug: true,
});

module.exports = withVibe({
  reactStrictMode: true,
});
```

### 4. Use in Server Components

```typescript
import { createVibeClient } from '@payez/vibe-client';

export default async function ProductsPage() {
  const vibe = createVibeClient();
  const { data: products, pagination } = await vibe.collection('products').list({
    limit: 20,
    orderBy: 'created_at',
    orderDir: 'desc',
  });

  return (
    <div>
      <ul>
        {products.map(p => <li key={p.id}>{p.name} - ${p.price}</li>)}
      </ul>
      <p>{pagination.total} products total</p>
    </div>
  );
}
```

### 5. Use in Client Components

```typescript
'use client';

import { useVibeCollection, useVibeCreate, useVibeDelete } from '@payez/vibe-client/react';

export function ProductList() {
  const { data, isLoading, error, pagination } = useVibeCollection('products', {
    limit: 10,
    orderBy: 'name',
    orderDir: 'asc',
  });

  const { mutate: createProduct } = useVibeCreate('products');
  const { mutate: deleteProduct } = useVibeDelete('products');

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={() => createProduct({ name: 'New Widget', price: 9.99 })}>
        Add Product
      </button>
      <ul>
        {data?.map(p => (
          <li key={p.id}>
            {p.name}
            <button onClick={() => deleteProduct(p.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 6. Configure React Hooks (Provider)

```typescript
// app/providers.tsx
'use client';

import { configureVibeClient } from '@payez/vibe-client/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    configureVibeClient({
      getAccessToken: async () => session?.accessToken || null,
    });
  }, [session?.accessToken]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

---

## Architecture

```
Your Next.js App
       |
       v
@payez/vibe-next-plugin          @payez/vibe-client
  |                                  |
  |  [build time]                    |  [runtime]
  |  - Wraps next.config.js          |  - createVibeClient()
  |  - Fetches schema from           |  - collection().list/get/create/update/delete
  |    VibeSQL via HMAC-signed       |  - React hooks (TanStack Query)
  |    requests                      |  - Admin client (roles, users, tenant)
  |  - Generates .d.ts files         |  - Auth utilities (RBAC)
  |    into node_modules/.vibe/      |
  |  - Dev watcher polls every       |  Transport: IDP Proxy (HMAC-signed POST)
  |    10s for schema changes        |         or: Direct API (GET/POST/PATCH/DELETE)
  |  - CLI: `npx vibe sync`         |
  |                                  |
  v                                  v
@vibe/types (auto-generated)     VibeSQL Backend
  - Per-collection .d.ts             - vibesql-server (.NET 9 + PostgreSQL)
  - VibeCollections interface        - vibesql-micro (Go + embedded PostgreSQL)
  - Type augmentation for            - Vibe Public API (hosted, HMAC auth)
    @vibe/client
```

**How it works:**

1. `@payez/vibe-next-plugin` hooks into webpack's server build. It calls your VibeSQL instance's `/v1/schemas/{collection}/typescript` endpoint (or fetches JSON schema and converts it) to generate TypeScript declarations.
2. The generated `@vibe/types` package uses [module augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) to extend `@payez/vibe-client`'s `VibeClient.collection()` method with your actual table types. You get autocomplete without writing a single type.
3. In dev mode, a watcher polls `/v1/schemas/hash` every N seconds. When the hash changes, types regenerate and `tsconfig.json` is touched to trigger TypeScript server reload.
4. At runtime, `@payez/vibe-client` sends requests either through an IDP proxy (HMAC-signed, recommended) or directly to a VibeSQL server.

---

## Connecting to VibeSQL

The SDK works with any VibeSQL-compatible backend:

| Backend | Use Case | Connection |
|---------|----------|------------|
| **vibesql-server** | Production, self-hosted | `.NET 9 + PostgreSQL`, `POST /v1/query` with HMAC auth |
| **vibesql-micro** | Local dev, single-user | `Go binary + embedded PostgreSQL 16.1`, port `5173` |
| **Vibe Public API** | SaaS, hosted | `api.idealvibe.online/v1/vsql/query` with HMAC headers |

Set `IDP_URL` (proxy mode) or `VIBE_API_URL` (direct mode) to point at your backend. The SDK handles the rest.

---

## API Reference

### Core Client

```typescript
import { createVibeClient, getVibeClient, resolveConfig } from '@payez/vibe-client';
```

#### `createVibeClient(config?)`

Creates a new client instance. Auto-configures from environment variables when no config is passed.

```typescript
const vibe = createVibeClient({
  apiUrl: 'https://vibe.example.com',    // Direct mode URL
  idpUrl: 'https://idp.example.com',     // IDP proxy URL (takes precedence)
  clientId: 'vibe_abc123',               // Client ID for auth
  signingKey: 'base64key==',             // HMAC signing key
  defaultCollection: 'vibe_app',         // Default collection name
  getAccessToken: async () => token,     // Bearer token provider
  debug: false,                          // Enable debug logging
  timeout: 30000,                        // Request timeout (ms)
});
```

#### `getVibeClient()`

Returns a singleton client configured from environment variables. Convenient for server components.

#### `vibe.collection<T>(name)`

Returns a typed collection accessor with full CRUD:

```typescript
const products = vibe.collection<Product>('products');

// List with pagination, ordering, filtering
const { data, pagination } = await products.list({
  limit: 20,
  offset: 0,
  orderBy: 'created_at',
  orderDir: 'desc',
  filter: { status: 'active' },
});

// Get by ID (returns null if not found)
const product = await products.get(123);

// Create
const newProduct = await products.create({ name: 'Widget', price: 9.99 });

// Update (partial)
const updated = await products.update(123, { price: 12.99 });

// Delete
await products.delete(123);
```

#### `vibe.admin`

Admin client for role, user, and tenant management:

```typescript
// Roles
const { data: roles } = await vibe.admin.roles.list();
const role = await vibe.admin.roles.get(1);
const newRole = await vibe.admin.roles.create({ name: 'editor' });
await vibe.admin.roles.update(1, { description: 'Content editor' });
await vibe.admin.roles.delete(1);

// Users
const { data: users } = await vibe.admin.users.list();
const user = await vibe.admin.users.get('user-uuid');
const userRoles = await vibe.admin.users.getRoles('user-uuid');

// Tenant
const config = await vibe.admin.tenant.getConfig();
```

### React Hooks

```typescript
import {
  useVibeCollection,
  useVibeDocument,
  useVibeCreate,
  useVibeUpdate,
  useVibeDelete,
  configureVibeClient,
  vibeKeys,
} from '@payez/vibe-client/react';
```

All hooks are built on [TanStack Query v5](https://tanstack.com/query). They require `@tanstack/react-query` and a `QueryClientProvider` in your tree.

| Hook | Purpose | Returns |
|------|---------|---------|
| `useVibeCollection(name, opts?)` | Paginated list query | `{ data, pagination, isLoading, error, refetch }` |
| `useVibeDocument(name, id, opts?)` | Single document query | `{ data, isLoading, error, refetch }` |
| `useVibeCreate(name)` | Create mutation | `{ mutate, mutateAsync, isLoading, error }` |
| `useVibeUpdate(name)` | Update mutation | `{ mutate, mutateAsync, isLoading, error }` |
| `useVibeDelete(name)` | Delete mutation | `{ mutate, mutateAsync, isLoading, error }` |
| `useVibeRoles(opts?)` | List roles | Same as `useVibeCollection` |
| `useVibeRole(id)` | Single role | Same as `useVibeDocument` |
| `useVibeCreateRole()` | Create role mutation | Same as `useVibeCreate` |
| `useVibeUpdateRole()` | Update role mutation | Same as `useVibeUpdate` |
| `useVibeDeleteRole()` | Delete role mutation | Same as `useVibeDelete` |
| `useVibeUsers(opts?)` | List users | Same as `useVibeCollection` |
| `useVibeUser(id)` | Single user | Same as `useVibeDocument` |
| `useVibeUserRoles(userId)` | User's roles | Same as `useVibeCollection` |
| `useVibeTenantConfig()` | Tenant configuration | Same as `useVibeDocument` |

Mutations automatically invalidate related queries on success.

`vibeKeys` is exported for custom query key management with TanStack Query.

### Auth Utilities

```typescript
import {
  hasRole,
  hasAnyRole,
  hasAllRoles,
  isAdmin,
  isPlatformAdmin,
  isClientAdmin,
  meetsRoleLevel,
  getHighestRoleLevel,
  VibeRoles,
  GlobalRoles,
  AppRoles,
  ADMIN_ROLES,
  PLATFORM_ADMIN_ROLES,
  CLIENT_ADMIN_ROLES,
  ROLE_HIERARCHY,
} from '@payez/vibe-client';
```

```typescript
// Check roles
if (isAdmin(user.roles)) { /* show admin panel */ }
if (isPlatformAdmin(user.roles)) { /* cross-tenant access */ }
if (hasRole(user.roles, VibeRoles.VIBE_CLIENT_ADMIN)) { /* tenant admin */ }

// Role hierarchy (higher = more access)
// payez_admin: 4, vibe_app_admin: 3, vibe_client_admin: 2, vibe_app_user: 1
if (meetsRoleLevel(user.roles, 2)) { /* at least client admin */ }
```

### Error Handling

```typescript
import { VibeError } from '@payez/vibe-client';

try {
  await vibe.collection('products').get(999);
} catch (err) {
  if (err instanceof VibeError) {
    console.log(err.code);     // 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | ...
    console.log(err.status);   // 404
    console.log(err.message);  // 'HTTP 404: Not Found'
    console.log(err.isRetryable()); // false (true for NETWORK_ERROR, RATE_LIMITED, SERVER_ERROR)
  }
}
```

Error codes: `NETWORK_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `SERVER_ERROR`, `UNKNOWN_ERROR`.

### Filter Syntax

Simple equality:

```typescript
await vibe.collection('products').list({
  filter: { status: 'active', category: 'electronics' },
});
```

Operator filters:

```typescript
await vibe.collection('products').list({
  filter: {
    price: { operator: 'gte', value: 10 },
    status: 'active',
  },
});
```

---

## Next.js Plugin Options

```typescript
interface VibePluginOptions {
  idpUrl?: string;          // IDP proxy URL. Default: process.env.IDP_URL
  clientId?: string;        // Client ID. Default: process.env.VIBE_CLIENT_ID
  signingKey?: string;      // HMAC key (base64). Default: process.env.VIBE_HMAC_KEY
  outputDir?: string;       // Generated types path. Default: 'node_modules/.vibe/types'
  collections?: string[];   // Specific collections to generate. Default: all
  devSync?: boolean;        // Hot-reload in dev. Default: true
  pollInterval?: number;    // Schema poll interval (ms). Default: 10000
  debug?: boolean;          // Debug logging. Default: false
}
```

---

## CLI

The `@payez/vibe-next-plugin` package ships a CLI for on-demand type generation:

```bash
# Sync types from your VibeSQL schema
npx vibe sync

# With debug output
npx vibe sync --debug

# Custom output directory
npx vibe sync --output ./src/types/vibe

# Override API URL
npx vibe sync --api-url https://vibe.example.com

# Override client ID
npx vibe sync --client-id vibe_abc123
```

---

## Configuration Reference

### Environment Variables

| Variable | Mode | Description |
|----------|------|-------------|
| `IDP_URL` | Proxy | IDP proxy URL (server-side) |
| `NEXT_PUBLIC_IDP_URL` | Proxy | IDP proxy URL (client-side) |
| `VIBE_CLIENT_ID` | Both | Client identifier |
| `VIBE_HMAC_KEY` | Proxy | HMAC signing key (base64) |
| `VIBE_API_URL` | Direct | VibeSQL server URL (server-side) |
| `NEXT_PUBLIC_VIBE_API_URL` | Direct | VibeSQL server URL (client-side) |
| `VIBE_COLLECTION` | Both | Default collection name (default: `vibe_app`) |

### Config Precedence

1. Inline config passed to `createVibeClient()` or `createWithVibe()`
2. Environment variables
3. Built-in defaults

---

## Documentation

See the [full documentation](./docs) for detailed guides:

- [Getting Started](./docs/getting-started.md) -- 5 minutes to your first typed query
- [Configuration](./docs/configuration.md) -- Environment variables, plugin options, auth setup
- [Examples](./docs/examples/) -- CRUD patterns, React hooks, server components

---

## Contributing

Contributions are welcome. The project uses npm workspaces with TypeScript 5.3+.

```bash
# Clone and install
git clone https://github.com/PayEz-Net/vibe-sdk.git
cd vibe-sdk
npm install

# Build all packages
npm run build

# Run tests
npm test

# Watch mode (development)
npm run dev
```

Packages are built with [tsup](https://tsup.egoist.dev) and tested with [Vitest](https://vitest.dev).

---

## License

[MIT](./LICENSE)

---

Part of the [VibeSQL](https://vibesql.online) ecosystem by [PayEz-Net](https://github.com/PayEz-Net).
