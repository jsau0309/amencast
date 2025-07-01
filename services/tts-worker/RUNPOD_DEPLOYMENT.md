# 🚀 RunPod Deployment Guide - Amencast TTS Worker

This guide will help you deploy the Amencast TTS Worker to RunPod for real-time audio translation.

## 📋 Prerequisites

1. **RunPod Account** - Sign up at [runpod.io](https://runpod.io)
2. **Docker Registry** - Docker Hub, GitHub Container Registry, or similar
3. **API Keys** - Cartesia/ElevenLabs, LiveKit, Redis, Supabase

## 🏗️ Step 1: Build and Push Docker Image

### Option A: Using the Deployment Script (Recommended)
```bash
cd services/tts-worker
./deploy-runpod.sh
```

### Option B: Manual Build
```bash
cd services/tts-worker
docker build -t amencast-tts-worker:latest .
docker tag amencast-tts-worker:latest your-registry/amencast-tts-worker:latest
docker push your-registry/amencast-tts-worker:latest
```

## 🌐 Step 2: Create RunPod GPU Pod

1. **Go to RunPod Console** → [runpod.io/console](https://runpod.io/console)
2. **Click "Deploy"** → "GPU Pod"
3. **Select GPU** - Any CUDA-compatible GPU (RTX 3080+ recommended)

### Pod Configuration:
```
Container Image: your-registry/amencast-tts-worker:latest
Container Disk: 5GB (minimum)
Volume Disk: 0GB (not needed)  
Exposed HTTP Ports: 8080
Container Start Command: npm run dev:realtime
```

## 🔧 Step 3: Configure Environment Variables

Copy the variables from `runpod.env.template` to your RunPod pod's environment:

### Required Variables:
```bash
# LiveKit (Your existing credentials)
LIVEKIT_URL=wss://amencast-wuciuykc.livekit.cloud
LIVEKIT_API_KEY=APIRAACavrweRcW
LIVEKIT_API_SECRET=xs0msOe80tGJZu4hRDHnU8N4Z8GsMIDnOfMuTIBWVtV

# TTS Service (Add your keys)
CARTESIA_API_KEY=your_cartesia_api_key_here
CARTESIA_VOICE_ID=your_voice_id_here

# Redis (For job coordination)
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS_ENABLED=true

# Database
DATABASE_URL=your_supabase_connection_string
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Health Check
HEALTH_PORT=8080
NODE_ENV=production
```

## 🧪 Step 4: Test the Deployment

### Health Check
Once your pod is running, test the health endpoint:
```bash
curl https://your-pod-id-8080.proxy.runpod.net/health
```

Expected response:
```json
{
  "status": "healthy",
  "activeJobs": 0,
  "uptime": 12.345,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### LiveKit Connection Test
1. Go to your frontend: `https://your-vercel-app.vercel.app/live?streamId=amencast-test-room-123`
2. Check RunPod logs for LiveKit connection messages
3. You should see: `[TTS-Worker] Connected to LiveKit room.`

## 🔍 Troubleshooting

### Pod Not Starting
- Check environment variables are set correctly
- Verify Docker image exists and is public
- Check RunPod logs for error messages

### LiveKit Connection Issues
- Verify `LIVEKIT_URL` starts with `wss://`
- Test API key/secret with LiveKit dashboard
- Check firewall/network settings

### Health Check Failing
- Ensure port 8080 is exposed
- Check if the health server is starting (look for log message)
- Verify container is not crashing

## 📊 Monitoring

### Key Log Messages to Watch:
```
✅ [TTS-Worker] Health server listening on port 8080
✅ [TTS-Worker] All Redis clients connected
✅ [TTS-Worker] Worker is running and listening for jobs
✅ [TTS-Worker] Connected to LiveKit room
```

### Performance Metrics:
- Health endpoint shows active jobs and uptime
- Monitor GPU usage in RunPod dashboard
- Watch Redis connection status

## 🔄 Updates and Scaling

### Update Deployment:
1. Build new Docker image with updated code
2. Push to registry with new tag
3. Update RunPod pod with new image
4. Restart pod

### Horizontal Scaling:
- Deploy multiple TTS worker pods
- Each pod can handle multiple streams simultaneously
- Load balancing happens automatically through LiveKit rooms

## 💰 Cost Optimization

### GPU Selection:
- **RTX 3080** - Good balance of price/performance
- **RTX 4090** - Best performance for high-volume
- **A6000** - Production-grade reliability

### Auto-Scaling:
- Use RunPod's serverless option for automatic scaling
- Configure based on Redis queue length
- Set minimum/maximum instance counts

## 🆘 Support

If you encounter issues:
1. Check RunPod logs first
2. Verify all environment variables
3. Test health endpoint
4. Check LiveKit dashboard for room activity

---

**Happy deploying! 🎉**

Your TTS worker is now ready to provide real-time audio translation in the cloud! 