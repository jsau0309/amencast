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

# Copy the service's package.json to install only its production dependencies
COPY --from=builder /app/services/tts-worker/package.json ./package.json
RUN npm install --production

# Copy the compiled code from the builder stage
COPY --from=builder /app/services/tts-worker/dist/ ./dist/

# Expose the port the service runs on
EXPOSE 8080

# Define the command to run the compiled application
CMD ["node", "dist/realtimeWorker.js"] 