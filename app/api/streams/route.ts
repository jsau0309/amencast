import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/utils'; // Adjusted path based on our previous prisma instance location
import { AccessToken } from 'livekit-server-sdk';

// Input schema for validation
const CreateStreamSchema = z.object({
  youtubeUrl: z.string().url({ message: "Invalid YouTube URL" }),
});

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = CreateStreamSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { youtubeUrl } = validationResult.data;

    // Database Interaction (Prisma)
    const newStream = await prisma.stream.create({
      data: {
        youtube_video_id: youtubeUrl,
        status: "pending", // Initial status
        listener_id: clerkUserId,
        started_at: new Date(),
      },
    });

    // LiveKit Token Generation
    const livekitHost = process.env.LIVEKIT_HOST;
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitHost || !livekitApiKey || !livekitApiSecret) {
      console.error('LiveKit environment variables are not set.');
      // Do not send sensitive error details to client in production
      return NextResponse.json({ error: "Stream created, but media token generation failed. Configuration error." }, { status: 500 }); 
    }

    const roomName = newStream.id; // Use stream ID as room name
    const participantName = clerkUserId; // Use clerkUserId as participant name/identity

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: participantName,
      // ttl: '1h' // Optional: token time-to-live
    });
    at.addGrant({ 
      room: roomName, 
      roomJoin: true, 
      canSubscribe: true, 
      canPublish: false, // Listeners typically don't publish
      canPublishData: false, // Listeners typically don't publish data
    });

    const livekitToken = await at.toJwt();

    return NextResponse.json(
      { streamId: newStream.id, livekitToken: livekitToken },
      { status: 201 } // 201 Created
    );

  } catch (error) {
    console.error("Error creating stream:", error);
    // Generic error for the client
    return NextResponse.json({ error: "Failed to create stream" }, { status: 500 });
  }
}

/**
 * Handles GET requests to the /api/streams endpoint.
 * Returns a list of streams for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const streams = await prisma.stream.findMany({
      where: {
        listener_id: clerkUserId,
      },
      orderBy: {
        started_at: 'desc',
      },
      // Optionally, select specific fields if not all are needed
      // select: { id: true, youtube_video_id: true, status: true, started_at: true }
    });

    return NextResponse.json(streams, { status: 200 });

  } catch (error) {
    console.error("Error fetching streams:", error);
    return NextResponse.json({ error: "Failed to fetch streams" }, { status: 500 });
  }
} 