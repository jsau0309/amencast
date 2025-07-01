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
TAG="latest"
REGISTRY="your-docker-registry" # Update this with your registry

echo -e "${YELLOW}📦 Building Docker image...${NC}"
docker build -t $IMAGE_NAME:$TAG .

echo -e "${GREEN}✅ Docker image built successfully!${NC}"

# Test the image locally (optional)
echo -e "${YELLOW}🧪 Testing image locally (optional)...${NC}"
echo "You can test the image locally with:"
echo "docker run -p 8080:8080 --env-file runpod.env.template $IMAGE_NAME:$TAG"
echo ""

# Push to registry (if configured)
if [ "$REGISTRY" != "your-docker-registry" ]; then
    echo -e "${YELLOW}📤 Pushing to registry...${NC}"
    docker tag $IMAGE_NAME:$TAG $REGISTRY/$IMAGE_NAME:$TAG
    docker push $REGISTRY/$IMAGE_NAME:$TAG
    echo -e "${GREEN}✅ Image pushed to registry!${NC}"
else
    echo -e "${YELLOW}⚠️  Registry not configured. Skipping push.${NC}"
    echo "To push to a registry, update the REGISTRY variable in this script."
fi

echo ""
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Upload the Docker image to your preferred registry (Docker Hub, GHCR, etc.)"
echo "2. Go to RunPod and create a new GPU pod"
echo "3. Use the uploaded image as your container image" 
echo "4. Copy environment variables from runpod.env.template to RunPod environment"
echo "5. Set the following RunPod configuration:"
echo "   - Container Image: your-registry/amencast-tts-worker:latest"
echo "   - Container Start Command: npm run dev:realtime"
echo "   - Exposed HTTP Ports: 8080"
echo "   - GPU: Any CUDA-compatible GPU"
echo ""
echo -e "${YELLOW}Health Check:${NC}"
echo "Your pod will be healthy when http://your-pod-url:8080/health returns 200"
echo ""
echo -e "${GREEN}Happy deploying! 🚀${NC}" 