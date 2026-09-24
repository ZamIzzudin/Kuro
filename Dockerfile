# syntax=docker/dockerfile:1
# Kuro — production image (target deploy: Dokploy, lihat README §Deploy)

# ===== Dependensi =====
FROM node:20-alpine AS deps
WORKDIR /app
# openssl dibutuhkan Prisma untuk mendeteksi engine yang tepat.
RUN apk add --no-cache openssl libc6-compat
# package-lock.json di-generate dengan npm 11 (mesin dev). Image node:20 membawa
# npm 10 yang meresolusi peer-dep opsional berbeda sehingga `npm ci` gagal
# ("Missing: @emnapi/... from lock file"). Selaraskan versi npm di sini.
ARG NPM_VERSION=11.6.2
RUN npm install -g npm@${NPM_VERSION}
COPY package.json package-lock.json ./
RUN npm ci

# ===== Build =====
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Folder public dibuat agar `COPY --from=builder /app/public` selalu valid
# (Next standalone menyalin aset statis dari sini).
RUN mkdir -p public
# prisma generate + next build (output standalone)
RUN npx prisma generate && npm run build

# ===== Runtime =====
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Chromium + dependensi untuk export PDF via Puppeteer (F5).
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto openssl libc6-compat
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# Prisma CLI butuh HOME yang writable untuk cache engine.
RUN mkdir -p /home/nextjs && chown -R nextjs:nodejs /home/nextjs
ENV HOME=/home/nextjs

# Prisma CLI dipakai entrypoint untuk menyinkronkan skema saat boot
# (lihat docker-entrypoint.sh). Versi disamakan dengan devDependency "prisma".
ARG PRISMA_VERSION=6.19.3
RUN npm install -g prisma@${PRISMA_VERSION} && npm cache clean --force

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Skema + constraint + seed dipakai entrypoint saat boot.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
