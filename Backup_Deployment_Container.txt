# ============================================================
#  OFC Leistungsdiagnostik - Railway Deployment Image
#  Radikal einfach & robust. Keine Features die nicht funktionieren.
#  - Node 20 Bookworm Slim (Debian, glibc)
#  - Kein VOLUME, kein MULTI-STAGE, kein npm ci, kein tini ENTRYPOINT
#  - Alles in einem Stageschritt. Build-Logs ausführlich mit echo.
# ============================================================

FROM node:20-bookworm-slim
WORKDIR /app

# ---- Basis-Umgebung -------------------------------------------------------
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:./data/ofc.db"
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

# Build-Tools (fuer better-sqlite3 native build)
RUN echo "[1/7] Install system build deps..." \
    && apt-get update -qq \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- Root Dependencies ----------------------------------------------------
COPY package.json ./
RUN echo "[2/7] Install root dependencies..." \
    && npm install --no-audit --no-fund --build-from-source --loglevel=error \
    || { echo "!!! npm install (root) FAILED"; exit 1; }

# ---- Client Dependencies --------------------------------------------------
COPY client/package.json ./client/
RUN echo "[3/7] Install client dependencies..." \
    && cd client \
    && npm install --no-audit --no-fund --build-from-source --loglevel=error \
    || { echo "!!! npm install (client) FAILED"; exit 1; }

# ---- Quellcode kopieren ---------------------------------------------------
RUN echo "[4/7] Copy source files..."
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
COPY client ./client

# ---- Generators -----------------------------------------------------------
RUN echo "[5/7] Generate Prisma Client..." \
    && npx prisma generate \
    || { echo "!!! prisma generate FAILED"; exit 1; }

# ---- Server TypeScript bauen ---------------------------------------------
RUN echo "[6/7] Compile TypeScript server..." \
    && npx tsc -p tsconfig.json \
    || { echo "!!! tsc FAILED"; ls -la src; exit 1; }

# ---- Client Vite bauen ----------------------------------------------------
RUN echo "[6b/7] Build Vite client..." \
    && npm run build:client \
    || { echo "!!! vite build FAILED"; exit 1; }

# ---- Build-Ergebnisse pruefen --------------------------------------------
RUN echo "[7/7] Verify build artifacts..." \
    && ls -la dist/server.js client/dist/index.html \
    || { echo "!!! Missing artifacts"; find . -maxdepth 3 -name "server.js" -o -name "index.html"; exit 1; }

# Aufraeumen: Dev-Deps weg, npm-Cache leeren (spart Platz)
RUN echo "Prune dev deps & cache..." \
    && npm prune --omit=dev 2>&1 | tail -5 || true \
    && npm cache clean --force 2>&1 | tail -3 || true \
    # Prisma Client sicherheitshalber nochmal erzeugen (passt zu node_modules nach prune)
    && npx prisma generate >/dev/null

# Datenbank-Verzeichnis anlegen (ohne VOLUME - ist per Railway UI ergaenzbar)
RUN mkdir -p /app/data && ls -la /app/data

EXPOSE 3000

# --- Start ---
# Reihenfolge: DB Schema auf aktuellen Stand bringen -> DB ggf. seeden -> Server.
# Jeder Schritt wird geloggt, damit man in Railway Deploy-Logs sieht, was passiert.
CMD [ "sh", "-c", "\
echo '=== [BOOT] OFC Leistungsdiagnostik ==='; \
echo \"HOST=$HOST  PORT=$PORT  DB=$DATABASE_URL  NODE_ENV=$NODE_ENV\"; \
echo ''; \
\
echo '[1/3] Prisma db push...'; \
mkdir -p data; \
npx prisma db push --skip-generate 2>&1 | tail -15; \
echo ''; \
\
echo '[2/3] Seed (if empty DB)...'; \
( npm run seed 2>&1 | tail -20 || true ); \
echo ''; \
\
echo '[3/3] Start server on 0.0.0.0:3000'; \
node dist/server.js \
" ]
