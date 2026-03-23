# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Generate Prisma client (needs dummy URL at build time)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm db:generate

# Build React app
RUN pnpm build:web

# Compile TypeScript (skip declarations — not needed for runtime)
RUN npx tsc --declaration false

# Production stage
FROM node:22-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy Prisma schema + generate client for prod
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/landing ./landing

# Uploads directory
RUN mkdir -p uploads

EXPOSE 4100
CMD ["node", "dist/server/src/index.js"]
