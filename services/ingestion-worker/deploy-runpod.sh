#!/bin/bash

# RunPod Ingestion Worker Deployment Script
# This script builds and prepares the ingestion worker for RunPod deployment

set -e

echo "🚀 Amencast Ingestion Worker - RunPod Deployment"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="amencast-ingestion-worker"
TAG="latest"
REGISTRY="samuel0109" # Your Docker Hub username

echo -e "${YELLOW}📦 Building Docker image...${NC}"
docker buildx build --platform linux/amd64 -t $REGISTRY/$IMAGE_NAME:$TAG . --push

echo -e "${GREEN}✅ Docker image built and pushed to Docker Hub!${NC}"

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Go to RunPod and create a new CPU pod"
echo "2. Use the image: $REGISTRY/$IMAGE_NAME:$TAG"
echo "3. Expose HTTP port: 3002"
echo "4. Set all required environment variables (see your .env file)"
echo "5. Health endpoint: http://[your-pod-id]-3002.proxy.runpod.net/health"
echo ""
echo -e "${GREEN}Happy deploying! 🚀${NC}" 