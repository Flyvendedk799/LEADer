# LEADer — multi-stage build for a containerised run.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm i; fi

# ── build ─────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── run ───────────────────────────────────────────────────────────────────
FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
# Apply schema then boot. Use `prisma migrate deploy` once you add migrations.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start"]
