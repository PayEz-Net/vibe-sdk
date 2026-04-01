# Changelog

All notable changes to the Vibe SDK packages are documented here.

---

## @payez/vibe-client

### 0.2.3 (2025-12-30)

- **fix**: Support `VIBE_APP_SIGNING_KEY` as fallback env var for HMAC key

### 0.2.1 -- 0.2.2 (2025-12-30)

- Patch releases for IDP proxy mode stabilization

### 0.2.0 (2025-12-30)

- **feat**: IDP proxy mode with HMAC-SHA256 request signing
- **feat**: Dual transport -- proxy mode (recommended) or direct API mode
- **feat**: HMAC signing via Web Crypto API (browser) with Node.js `crypto` fallback
- **feat**: Proxy request format (`{ endpoint, method, data }` through `POST /api/vibe/proxy`)
- **feat**: `X-Vibe-Client-Id`, `X-Vibe-Timestamp`, `X-Vibe-Signature` headers for proxy auth

### 0.1.0 (2025-12-20)

- **Initial release**
- Core `createVibeClient()` and `getVibeClient()` factory functions
- `collection<T>(name)` with `list`, `get`, `create`, `update`, `delete`
- `ListOptions` with `limit`, `offset`, `orderBy`, `orderDir`, `filter`
- `admin.roles`, `admin.users`, `admin.tenant` management
- React hooks: `useVibeCollection`, `useVibeDocument`, `useVibeCreate`, `useVibeUpdate`, `useVibeDelete`
- Admin hooks: `useVibeRoles`, `useVibeRole`, `useVibeCreateRole`, `useVibeUpdateRole`, `useVibeDeleteRole`, `useVibeUsers`, `useVibeUser`, `useVibeUserRoles`, `useVibeTenantConfig`
- `configureVibeClient()` for React hook configuration
- `vibeKeys` query key factory for TanStack Query
- `VibeError` class with error codes, `fromResponse`, `fromError`, `isRetryable`
- `convertFiltersToVibeFormat` utility
- ESM + CJS dual output via tsup
- React and TanStack Query as optional peer dependencies

---

## @payez/vibe-client (auth)

### Added in 0.2.3 (2026-02-08)

- **feat**: Role-based auth utilities
- `VibeRoles`, `GlobalRoles`, `AppRoles` role constants
- `ADMIN_ROLES`, `PLATFORM_ADMIN_ROLES`, `CLIENT_ADMIN_ROLES` role groups
- `ROLE_HIERARCHY` with numeric levels (1--4)
- `hasRole`, `hasAnyRole`, `hasAllRoles` role checks
- `isAdmin`, `isPlatformAdmin`, `isClientAdmin` convenience checks
- `getHighestRoleLevel`, `meetsRoleLevel` hierarchy utilities

---

## @payez/vibe-next-plugin

### 0.1.1 (2025-12-30 -- 2026-01-10)

- **fix**: Use `VIBE_HMAC_KEY` as primary env var name for HMAC signing key
- **feat**: IDP proxy support for schema fetching (HMAC-signed proxy requests)
- **feat**: Legacy direct API mode preserved as fallback

### 0.1.0 (2025-12-20)

- **Initial release**
- `withVibe()` and `createWithVibe()` Next.js config wrappers
- Build-time type generation from VibeSQL schemas
- `@vibe/types` auto-generated package with module augmentation for `@vibe/client`
- Per-collection `.d.ts` files with `Create` and `Update` type variants
- JSON schema to TypeScript conversion fallback
- Dev watcher with configurable poll interval (default: 10s)
- Schema hash-based change detection
- `tsconfig.json` touch to trigger TypeScript server reload
- CLI: `npx vibe sync` with `--debug`, `--output`, `--api-url`, `--client-id` flags
- `SchemaField` metadata: `x-vibe-pk`, `x-vibe-auto-increment`, `x-vibe-tokenize`
