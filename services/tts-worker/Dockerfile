# Use Node.js 20 with GPU support base image
FROM node:20-slim

# Install system dependencies needed for audio processing and GPU support
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY tsconfig.json ./

# Install TypeScript globally for runtime compilation
RUN npm install -g typescript ts-node

# Generate Prisma client
RUN npx prisma generate

# Expose port (RunPod typically uses 8080)
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the TTS worker in realtime mode
CMD ["npm", "run", "dev:realtime"] 