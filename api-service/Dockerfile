# ---------- Build Stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ---------- Production Stage ----------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Chromium + deps for Puppeteer (QR PDF download)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Use non-root user for security
USER node

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 5000

CMD ["node", "dist/index.js"]
