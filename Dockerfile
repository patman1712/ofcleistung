# OFC Leistungsdiagnostik - Railway Deployment Image
# Robustes Node 20 (Debian Bookworm Slim) - glibc statt musl.
# Einfache Single-Stage-Strategie (weniger Dinge die schief gehen)

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:./data/ofc.db"

# Build-Tools + tini installieren (fuer native Module + PID-1)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        ca-certificates \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------
# Root-Dependencies
# ------------------------------------------------------------------
COPY package.json ./
RUN touch package-lock.json 2>/dev/null; true
RUN npm install --no-audit --no-fund --build-from-source

# ------------------------------------------------------------------
# Client-Dependencies
# ------------------------------------------------------------------
COPY client/package.json ./client/
RUN touch client/package-lock.json 2>/dev/null; true
WORKDIR /app/client
RUN npm install --no-audit --no-fund --build-from-source
WORKDIR /app

# ------------------------------------------------------------------
# Quellcode kopieren + bauen
# ------------------------------------------------------------------
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
COPY client ./client

# Prisma Client generieren + Server kompilieren
RUN npx prisma generate
RUN echo "=== TypeScript Build Server ===" \
    && npx tsc -p tsconfig.json || { echo "TSC FAILED - Listing dist"; ls -la dist 2>/dev/null; exit 1; }

# Client bauen (Vite)
RUN echo "=== Vite Build Client ===" \
    && npm run build:client || { echo "CLIENT BUILD FAILED"; ls -la client/dist 2>/dev/null; exit 1; }

# Build-Artefakte pruefen
RUN echo "=== Build Results ===" \
    && ls -la dist/server.js client/dist/index.html

# ------------------------------------------------------------------
# Laufzeit vorbereiten
# ------------------------------------------------------------------
# Dev-Deps entfernen (wir brauchen tsx, aber das ist jetzt in dependencies)
RUN npm prune --omit=dev || true \
    && npm cache clean --force || true \
    # Prisma-Client sicherheitshalber neu erzeugen (passt zu aktueller Node/Arch)
    && npx prisma generate

# Daten-Verzeichnis (Volume auf Railway)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

# Einziger Start-Einstieg: Genau wie lokal via start:prod
# DB-Push + Seed + Server - konsistent mit package.json Script
CMD ["sh", "-c", "mkdir -p data && npm run prisma:push 2>&1 | tail -20 && (npm run seed 2>&1 | tail -30 || true) && npm run start"]
