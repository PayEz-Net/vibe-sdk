# Changelog

All notable changes to the Vibe SDK packages are documented here.

---

## @payez/vibe-client

### 0.3.1 (unreleased)

- **change (PAY-2317), token getter**: `getAccessToken` is now single-flight and briefly memoised. `httpRequest` awaited it before
  EVERY call, so a getter that does a network round trip (a session fetch) added one serial round trip per call and a
  burst of 15 made 15. Concurrent calls now share one read, and a result is reused for `tokenCacheMs` (default 5000).
  The reuse is bounded: never longer than the token's remaining life minus 30 s (from `expiresIn` when the getter returns
  `{ token, expiresIn }`, else from a JWT `exp`, no network call); never for `null` or a thrown error; dropped on a 401. It is
  capped at `tokenCacheMs` even for an hour-long token because the SDK cannot see your logout or account switch.
  **`tokenCacheMs: 0` restores the exact pre-0.3.1 behaviour (getter on every call).** Apps whose getter must run on every
  request (rotating per-request tokens) should set it. New exports: `createTokenCache`, `jwtExpSeconds`, `TokenResult`,
  `AccessTokenGetter`, `TokenCache`, `DEFAULT_TOKEN_CACHE_MS`. `getAccessToken` may now also return `{ token, expiresIn }`.
- **add (PAY-2317), proxy-mode hint**: in IDP proxy mode (`idpUrl` set) the SDK logs ONE informational line per process, outside
  production or with `debug`, saying each call goes client -> IdP -> Vibe API (two hops). It judges no distance and makes no
  network call. Direct mode is not recommended blindly: Enterprise routes require the proxy.

### 0.3.0 (unreleased)

- **change (PAY-2317), cache defaults**: every query hook now sets `staleTime: 30000` and
  `refetchOnWindowFocus: false`. TanStack's own defaults (stale at once, refetch on every mount, focus and
  reconnect) turned one page into repeated identical calls on a slow link. Override per hook with
  `staleTime` / `refetchOnWindowFocus` (hook options for `useVibeCollection` / `useVibeDocument`, a trailing
  argument for the admin hooks). **Note:** a value set on the hook takes precedence over your
  `QueryClient` `defaultOptions`; pass `{ staleTime: 0 }` to restore refetch-on-mount for one hook.
  New exports: `VIBE_QUERY_DEFAULTS`, `queryBehavior`, `QueryBehavior`.
- **change (PAY-2317), retry policy**: `vibeRetry` no longer retries every non-429 failure three times.
  429 / `TIMEOUT` / any other 4xx: never (a 400/401/403/404 cannot heal; a timeout already waited the whole
  `timeout`). 5xx: once. `NETWORK_ERROR`: twice. Anything else: once. Mutations are unchanged (no retry).
- **fix (PAY-2317), new error code `TIMEOUT`**: an aborted request (the `timeout` option elapsed) was reported as
  `NETWORK_ERROR`, indistinguishable from a dropped connection. It is now `TIMEOUT` and is not
  `isRetryable()`. Code that switches on `err.code === 'NETWORK_ERROR'` to detect a timeout must also check
  `'TIMEOUT'`.
- Not in this release (designed on PAY-2317, later): token-getter memoisation, proxy-mode hint.

### 0.2.4 (2026-10-08)

- **fix (PAY-2125)**: `list({ filter })` in proxy mode now emits Core's FLAT
  condition for a single filter and the COMPOUND group
  `{ operator: 'and', filters: [...] }` for several, instead of a bare array.
  An array does not bind Core's `QueryRequest.Filter` (a `VibeFilterNode`) and
  is refused with 400, so any filtered query was failing. The now-unused
  `filter` key is omitted when no condition survives (previously an array was
  always sent). Field names are passed through bare (Core maps a bare name to
  the JSONB `data->>'name'`; a `data.` prefix is redundant for data fields and
  wrong for document columns).

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

### 0.1.2 (2026-10-08)

- **fix (PAY-2125)**: the generated `@vibe/types` package now augments
  `@payez/vibe-client` (was `@vibe/client`, which does not exist on npm). A
  consumer project that installed no `@vibe/client` got an ambient declaration
  of a nonexistent module, so the augmentation never reached
  `VibeClient.collection()`. Package name aligned to `@payez/vibe-next-plugin`
  (the name it has always been published under).

### 0.1.1 (2025-12-30 -- 2026-01-10)

- **fix**: Use `VIBE_HMAC_KEY` as primary env var name for HMAC signing key
- **feat**: IDP proxy support for schema fetching (HMAC-signed proxy requests)
- **feat**: Legacy direct API mode preserved as fallback

### 0.1.0 (2025-12-20)

- **Initial release**
- `withVibe()` and `createWithVibe()` Next.js config wrappers
- Build-time type generation from VibeSQL schemas
- `@vibe/types` auto-generated package with module augmentation for `@payez/vibe-client`
- Per-collection `.d.ts` files with `Create` and `Update` type variants
- JSON schema to TypeScript conversion fallback
- Dev watcher with configurable poll interval (default: 10s)
- Schema hash-based change detection
- `tsconfig.json` touch to trigger TypeScript server reload
- CLI: `npx vibe sync` with `--debug`, `--output`, `--api-url`, `--client-id` flags
- `SchemaField` metadata: `x-vibe-pk`, `x-vibe-auto-increment`, `x-vibe-tokenize`
