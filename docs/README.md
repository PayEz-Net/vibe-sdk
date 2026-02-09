# Vibe SDK Documentation

**Automatic ORM for VibeSQL** — Zero configuration, full type safety, hot-reload on schema changes.

---

## Quick Links

- [Getting Started](./getting-started.md) — 5 minutes to your first typed query
- [Installation](./installation.md) — Detailed setup guide
- [Configuration](./configuration.md) — Environment variables and options
- [API Reference](./api-reference.md) — Complete API documentation
- [Architecture](./architecture.md) — How it works under the hood
- [Examples](./examples/) — Real-world usage patterns

---

## What is Vibe SDK?

Vibe SDK eliminates the entire ORM configuration layer. Connect your Next.js app to your VibeSQL schema and get:

- **Auto-generated TypeScript types** — Your schema becomes typed classes automatically
- **Live hot-reload** — Polls for schema changes every 10 seconds, regenerates types
- **Pre-built CRUD** — Insert, update, delete, query with full type safety
- **React hooks** — `useVibeCollection()` for client components
- **Server components** — `createVibeClient()` for async server-side queries
- **Zero ORM config** — No Prisma schema, no TypeORM decorators, no migration scripts

---

## The Vision

**"Make your VibeSQL schema, connect to Next MVP, get typed classes with pre-built connection funnel — entire ORM automated"**

Change your VibeSQL schema → Types update automatically → Keep coding

It's one of those things that just always works, so you never think about it. **It's doing the things.**

---

## Documentation Structure

### Getting Started
- [Quick Start Guide](./getting-started.md)
- [Your First Query](./examples/basic-crud.md)

### Setup & Configuration
- [Installation](./installation.md)
- [Configuration](./configuration.md)
- [Next.js Plugin Setup](./nextjs-plugin.md)

### Core Concepts
- [Type Generation](./type-generation.md)
- [Authentication](./authentication.md)
- [Error Handling](./error-handling.md)

### API Reference
- [Client API](./api-reference.md#client-api)
- [React Hooks](./api-reference.md#react-hooks)
- [Admin Client](./api-reference.md#admin-client)
- [Authorization Utilities](./api-reference.md#authorization)

### Advanced
- [Architecture](./architecture.md)
- [Hot-Reload Internals](./hot-reload.md)
- [IDP Proxy Mode](./idp-proxy.md)
- [Migration Guide](./migration-guide.md)

### Examples
- [Basic CRUD](./examples/basic-crud.md)
- [React Hooks](./examples/react-hooks.md)
- [Server Components](./examples/server-components.md)
- [Authentication](./examples/authentication.md)
- [Role-Based Access](./examples/rbac.md)

---

## Support

- **GitHub Issues**: [vibe-sdk/issues](https://github.com/PayEz-Net/vibe-sdk/issues)
- **Email**: developers@payez.net
- **Documentation**: This is it!

---

**The ORM That Disappears** — Build with Vibe SDK
