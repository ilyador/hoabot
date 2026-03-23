# CLAUDE.md

## Git Workflow

- All work is done on the `dev` branch.
- Only merge into `main` when the user explicitly says to.

## Project

HOABot — AI-powered HOA management SaaS. Express 5 + tRPC v11 + React 19 + Prisma 6 + PostgreSQL.

## Commands

```bash
pnpm dev              # Run server + web dev servers
pnpm dev:server       # Server only (tsx watch, port 4100)
pnpm dev:web          # Vite dev server (port 5174)
pnpm dev:landing      # Landing page (serve, port 4200)
pnpm build:web        # Build React app
pnpm db:push          # Push Prisma schema to DB
pnpm db:generate      # Generate Prisma client
```

