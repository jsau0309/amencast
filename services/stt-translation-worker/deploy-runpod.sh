#!/bin/bash

# RunPod STT Translation Worker Deployment Script
set -e

echo "🚀 Amencast STT Translation Worker - RunPod Deployment"
echo "======================================================"

# Configuration
IMAGE_NAME="amencast-stt-translation-worker"
TAG="latest"
REGISTRY="samuel0109" # Your Docker Hub username

echo "📦 Building and pushing Docker image..."
docker buildx build --platform linux/amd64 -f services/stt-translation-worker/Dockerfile -t $REGISTRY/$IMAGE_NAME:$TAG . --push

echo "✅ Docker image built and pushed to Docker Hub!"
echo ""
echo "Next steps:"
echo "1. Go to RunPod and create a new CPU pod."
echo "2. Use the image: $REGISTRY/$IMAGE_NAME:$TAG"
echo "3. Container Start Command: node dist/realtimeWorker.js"
echo "4. Set all required environment variables (ASSEMBLYAI_API_KEY, OPENAI_API_KEY, etc.)."
echo "5. This worker has NO health endpoint; monitor using logs."
echo ""
echo "Happy deploying! 🚀" 