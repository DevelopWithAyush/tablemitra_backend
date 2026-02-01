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

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Use non-root user for security
USER node

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 5002

CMD ["node", "dist/index.js"]
