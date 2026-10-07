# Build stage
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
COPY prisma.config.ts tsconfig.json ./
RUN DATABASE_URL=postgresql://build:build@localhost/build npx prisma generate

COPY src ./src/
RUN npm run build

# Runtime stage
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm install --no-save prisma@7 dotenv

COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY --from=builder /app/dist ./dist

EXPOSE 8000
# Apply pending migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
