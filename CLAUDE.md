# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Name**: happy-server
**Language**: TypeScript (strict mode)
**Runtime**: Node.js 20
**Framework**: Fastify 5
**Database**: SQLite with Prisma ORM
**Package Manager**: Yarn (not npm)

## Development Commands

```bash
yarn build          # TypeScript type checking
yarn start          # Start the server
yarn dev            # Start with development env
yarn test           # Run all tests
yarn migrate        # Run Prisma migrations (uses .env.dev)
yarn generate       # Generate Prisma client
```

Run a single test:
```bash
yarn test sources/app/social/friendNotification.spec.ts
```

## Architecture

### Source Structure
```
/sources
├── /app                    # Application logic (domain-specific)
│   ├── /api
│   │   ├── /routes        # Fastify API routes
│   │   ├── /socket        # Socket.IO event handlers
│   │   └── socket.ts      # Socket.IO server config
│   ├── /auth              # Authentication (privacy-kit tokens)
│   ├── /events            # Event routing (eventRouter.ts)
│   ├── /social            # Friend system
│   ├── /feed              # User feed
│   ├── /presence          # Session cache & timeout
│   ├── /session           # Session CRUD
│   ├── /kv                # Key-value storage
│   └── /monitoring        # Prometheus metrics
├── /modules               # Shared utilities
│   ├── encrypt.ts         # Key tree management (privacy-kit)
│   └── github.ts          # GitHub OAuth integration
├── /storage               # Data layer
│   ├── db.ts              # Prisma client + SQLite optimizations
│   ├── cache.ts           # In-memory cache with TTL (node-cache)
│   ├── inTx.ts            # Transaction wrapper with retry logic
│   ├── simpleCache.ts     # Simple in-memory cache
│   ├── files.ts           # Local file storage (data/files/)
│   └── processImage.ts    # Image processing (requires FFmpeg)
├── /utils                 # Pure utilities
└── main.ts                # Entry point
```

### Key Patterns

**WebSocket (Socket.IO)**: Three connection scopes at `/v1/updates`:
- `user-scoped`: Receives all user updates (mobile/web clients)
- `session-scoped`: Receives only specific session updates
- `machine-scoped`: Receives daemon/machine-specific updates

Events split into two types:
- **Update events**: Persistent, stored in DB (`new-session`, `new-message`, etc.)
- **Ephemeral events**: Transient, not stored (`activity`, `usage`, `machine-status`)

**Authentication**: Uses `privacy-kit` library for token management:
- Persistent tokens: Never expire, cached in memory
- GitHub OAuth tokens: 5-minute TTL
- HTTP: Bearer token via `enableAuthentication` decorator
- WebSocket: Token in handshake `auth` object

**Transaction Handling**: Use `inTx()` for all database writes. It provides automatic retry on conflicts:
```typescript
import { inTx, afterTx } from "@/storage/inTx";

await inTx(async (tx) => {
    await tx.user.create({ ... });
    afterTx(tx, () => eventbus.emit('user-created'));  // Events after commit
});
```

**Action Functions**: Database operations go in dedicated files under `/app/{domain}/`:
- File name = function name (e.g., `friendAdd.ts` exports `friendAdd()`)
- Prefix with entity type, then action: `friendAdd`, `sessionCreate`, `feedPost`
- Add JSDoc comment explaining the logic

**API Routes**: Use Fastify + Zod for type-safe endpoints:
```typescript
app.post('/v1/endpoint', {
    schema: {
        body: z.object({ ... }),
        response: { 200: z.object({ ... }) }
    },
    preHandler: app.authenticate
}, async (request, reply) => { ... });
```

**Imports**: Always use absolute imports with `@/` prefix:
```typescript
import { db } from "@/storage/db";
import { inTx } from "@/storage/inTx";
```

## Database (SQLite + Prisma)

- Schema: `prisma/schema.prisma`
- Data: `data/db.sqlite` (configurable via `DATABASE_URL`)
- **Never create migrations** - only run `yarn generate` for schema changes
- Use `Json` type for complex fields
- Enum types not supported - use string constants instead (see `relationshipStatus.ts`)

SQLite optimizations applied at startup:
```sql
PRAGMA journal_mode = WAL       -- Better concurrency
PRAGMA synchronous = NORMAL     -- Balance safety/performance
PRAGMA busy_timeout = 5000      -- 5s lock wait
```

## Monitoring

- Health check: `GET /health` (tests DB connection)
- Prometheus metrics at `/metrics`: connections, events, HTTP latency, DB records

## Code Conventions

- 4 spaces indentation
- Functional programming patterns; avoid classes
- Prefer interfaces over types
- Use maps instead of enums
- Test files: `*.spec.ts` suffix
- Base64 encoding: Use `privacyKit.encodeBase64`/`decodeBase64` (not Buffer)

## Important Rules

1. **Idempotency**: All API operations must handle retries gracefully
2. **No unnecessary files**: Edit existing files; don't create new ones unless required
3. **No logging unless asked**: Don't add console.log or logging statements
4. **Don't run non-transactional operations inside transactions** (e.g., file uploads)
5. **Action functions return only essential data** - no "just in case" returns

## Debugging

Logs directory: `.logs/` (enabled via `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING=true`)

```bash
# Check errors
tail -100 .logs/*.log | grep -E "(error|Error|failed)"

# Monitor sessions
tail -f .logs/*.log | grep -E "(new-session|Session created)"

# Check connections
tail -100 .logs/*.log | grep -E "(Token verified|User connected|User disconnected)"
```

## Environment

Required:
- Node.js 20
- FFmpeg + Python3 (for media processing)

Key env vars in `.env.dev`:
- `DATABASE_URL` - SQLite path (default: `file:./data/db.sqlite`)
- `HANDY_MASTER_SECRET` - Encryption key
- `PORT` - Server port (default: 3005)
- `PUBLIC_URL` - Public URL prefix for file access (optional, defaults to `http://localhost:PORT`)
