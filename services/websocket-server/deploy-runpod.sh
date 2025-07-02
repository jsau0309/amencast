#!/bin/bash

# RunPod WebSocket Server Deployment Script
set -e

echo "🚀 Amencast WebSocket Server - RunPod Deployment"
echo "================================================"

# Configuration
IMAGE_NAME="amencast-websocket-server"
TAG="v2"
REGISTRY="samuel0109" # Your Docker Hub username

echo "📦 Building and pushing Docker image..."
docker buildx build --platform linux/amd64 -f services/websocket-server/Dockerfile -t $REGISTRY/$IMAGE_NAME:$TAG . --push

echo "✅ Docker image built and pushed to Docker Hub!"
echo ""
echo "Next steps:"
echo "1. Update your pod on RunPod."
echo "2. Image: $REGISTRY/$IMAGE_NAME:$TAG"
echo "3. Start Command: node dist/index.js"
echo "4. Expose HTTP port: 3001"
echo "5. Set environment variables."
echo "6. Health endpoint: /health"
echo ""
echo "This is the final deployment. Good luck! 🚀" 