# Stage 1: The Builder
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx tsc --project services/tts-worker/tsconfig.json

# Stage 2: The Production Image
FROM node:20-slim

# Install root certificates, which are necessary for TLS connections
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/services/tts-worker/package.json ./package.json
RUN npm install --production
COPY --from=builder /app/services/tts-worker/dist/ ./dist/
EXPOSE 8080
CMD ["node", "dist/realtimeWorker.js"] 