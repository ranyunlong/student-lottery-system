FROM node:24-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
  BETTER_AUTH_SECRET=build-only-secret-change-me \
  EMBLEM_DIR=/tmp/emblems \
  npm run build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV EMBLEM_DIR=/var/lib/student-lottery/emblems

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /var/lib/student-lottery/emblems \
  && chown -R node:node /var/lib/student-lottery

USER node
EXPOSE 3000
CMD ["node", "server.js"]
