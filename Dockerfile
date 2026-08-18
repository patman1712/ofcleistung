# syntax = docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

# --- Stage: Dependencies (root + better-sqlite3 build needs python3/make/g++)
FROM base AS deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --build-from-source; else npm install --build-from-source; fi

# --- Stage: Client dependencies
FROM deps AS client-deps
COPY client/package.json client/package-lock.json* client/
WORKDIR /app/client
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# --- Stage: Build client
FROM node:20-alpine AS client-build
WORKDIR /app
COPY --from=client-deps /app/node_modules ./node_modules
COPY --from=client-deps /app/client/node_modules ./client/node_modules
COPY client ./client
COPY package.json ./
RUN npm run build:client

# --- Stage: Build server
FROM base AS server-build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY package.json ./
RUN npx prisma generate && npx tsc -p tsconfig.json

# --- Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# SQLite DB liegt in /app/data - wird per Railway-Volume gemountet
ENV DATABASE_URL="file:./data/ofc.db"

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 runner

COPY --from=deps /app/node_modules ./node_modules
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /app/client/dist ./client/dist
COPY --from=server-build /app/prisma ./prisma
COPY package.json ./

# Volume-Verzeichnis anlegen (SQLite-DB persistiert hier)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

RUN chown -R runner:nodejs /app
USER runner

EXPOSE 3000

# 1. DB automatisch auf Schema-Stand bringen (db push bei SQLite)
# 2. Seed ausführen (Admin + Beispielfragen, falls leer)
# 3. Server starten
CMD ["sh", "-c", "npm run start:prod"]
