# LEADer — multi-stage build for a containerised run.
FROM node:22-alpine AS base
RUN --mount=type=secret,id=ca_bundle \
  if [ -f /run/secrets/ca_bundle ]; then export SSL_CERT_FILE=/run/secrets/ca_bundle; fi; \
  apk add --no-cache git openssl
RUN corepack enable
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN --mount=type=secret,id=ca_bundle \
  if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle GIT_SSL_CAINFO=/run/secrets/ca_bundle; fi; \
  if [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm i; fi

# ── build ─────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=ca_bundle \
  if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi; \
  npx prisma generate && npm run build

# ── run ───────────────────────────────────────────────────────────────────
FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
# Apply versioned, non-destructive migrations before accepting traffic.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
