# Single Cloud Run service that serves everything: the built React frontend,
# the REST API, and Socket.io real-time multiplayer, all from one Node
# process. Using one Debian-based image (not alpine) for every stage keeps
# better-sqlite3's native binding consistent between build and runtime.

# ---- Stage 1: build the frontend (static assets) ----
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install backend deps (needs a compiler for better-sqlite3) ----
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY backend/src ./src

# ---- Stage 3: runtime ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/src ./src
COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 8080
CMD ["node", "src/server.js"]
