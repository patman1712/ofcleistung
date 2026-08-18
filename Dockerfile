# syntax = docker/dockerfile:1

# OFC Leistungsdiagnostik - Railway Deployments-Image
# Einfaches, robustes Node 20 (Debian Bookworm/Slim - glibc statt musl)
# Vermeidet Alpine-Komplikationen mit better-sqlite3 / nativen Modulen.

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Build-Tools vorhalten (wird für better-sqlite3 ggf. benötigt)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------
# Stufe 1: Root-Dependencies + Prisma + Server bauen
# ------------------------------------------------------------------
COPY package*.json ./
RUN npm install --no-audit --no-fund --build-from-source

COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
RUN npx prisma generate
RUN npx tsc -p tsconfig.json || { echo "TSC FAILED"; ls -la; exit 1; }

# ------------------------------------------------------------------
# Stufe 2: Client-Dependencies + Client bauen
# ------------------------------------------------------------------
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm install --no-audit --no-fund
WORKDIR /app

COPY client ./client
RUN npm run build:client

# ------------------------------------------------------------------
# Laufzeit-Stage (schlank)
# ------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# SQLite - Default (kann per Railway Variable überschrieben werden)
ENV DATABASE_URL="file:./data/ofc.db"

# Nur Laufzeit-Dependencies neu aufbauen (cleaner & kleiner)
COPY package*.json ./
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends python3 make g++ ca-certificates tini && \
    rm -rf /var/lib/apt/lists/* && \
    npm install --omit=dev --no-audit --no-fund --build-from-source && \
    npx prisma generate && \
    apt-get remove -y python3 make g++ && apt-get autoremove -y || true

# Artefakte aus Build-Stage übernehmen
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma 2>/dev/null || true

# Daten-Verzeichnis (SQLite-DB + Railway Volume)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

# Automatischer Ablauf: DB auf Schema-Stand (push) → Seed (falls leer) → Server
CMD ["sh", "-c", "mkdir -p data && npx prisma db push --skip-generate && (npm run seed 2>&1 || true) && node dist/server.js"]
