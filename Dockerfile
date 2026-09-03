# Single Cloud Run service that serves everything: the built React frontend,
# the REST API, and Socket.io real-time multiplayer, all from one Node
# process. Persistent data (accounts, scores) lives in Cloud SQL (Postgres),
# reached over the Unix socket Cloud Run creates via --add-cloudsql-instances
# — see backend/src/db.js and README.md.

# ---- Stage 1: build the frontend (static assets) ----
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install backend deps (pure JS — no native compiler needed) ----
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app/backend
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
