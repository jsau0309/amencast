#!/bin/bash

# RunPod TTS Worker Deployment Script
# This script builds and prepares the TTS worker for RunPod deployment

set -e

echo "🚀 Amencast TTS Worker - RunPod Deployment"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="amencast-tts-worker"
TAG="v2"
REGISTRY="samuel0109"

echo "📦 Building and pushing Docker image..."
docker buildx build --platform linux/amd64 -f services/tts-worker/Dockerfile -t $REGISTRY/$IMAGE_NAME:$TAG . --push
echo "✅ Docker image built and pushed to Docker Hub!"
echo ""
echo "Next steps:"
echo "1. Update your pod on RunPod."
echo "2. Image: $REGISTRY/$IMAGE_NAME:$TAG"
echo "3. Start Command: node dist/realtimeWorker.js"
echo "4. Expose HTTP port: 8080"
echo "5. Set environment variables."
echo ""
echo "Happy deploying! 🚀" 