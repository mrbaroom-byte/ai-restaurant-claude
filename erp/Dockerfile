# One image, three run modes: web, worker and migrate. Same build, different command.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# The build only needs a syntactically valid URL; it never connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# Produces .next/standalone, which the runner stage copies.
ENV BUILD_STANDALONE=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# postgresql-client for pg_dump and psql, which the backup and restore scripts shell out to.
# aws-cli for uploading the archive. openssl for the ZATCA key operations Node delegates.
RUN apk add --no-cache openssl postgresql16-client aws-cli tini \
 && addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nakhla -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nakhla:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nakhla:nodejs /app/.next/static ./.next/static
# The worker, the migrations and the operational scripts run from source via tsx.
COPY --from=builder --chown=nakhla:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nakhla:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nakhla:nodejs /app/src ./src
COPY --from=builder --chown=nakhla:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nakhla:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nakhla:nodejs /app/tsconfig.json ./tsconfig.json

USER nakhla
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps the child processes pg_dump and psql leave behind.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
