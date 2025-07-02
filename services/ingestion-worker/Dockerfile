# Use Node.js 20 slim as a base image
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y ffmpeg python3-pip && python3 -m pip install --break-system-packages -U yt-dlp && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the pre-compiled code, node_modules, and other assets
COPY services/ingestion-worker/dist/ ./dist/
COPY node_modules/ ./node_modules/
COPY services/ingestion-worker/package.json ./package.json

# Expose the port
EXPOSE 3002

# Run the compiled application
CMD ["node", "dist/index.js"] 