import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import prisma from '@/lib/prisma'; // Adjust path if you placed prisma.ts elsewhere (e.g., ../../lib/prisma)

const CreateStreamSchema = z.object({
  youtubeUrl: z.string().url({ message: "Invalid YouTube URL" }),
  languageTarget: z.string().optional(),
  format: z.string().optional(), 
});

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = getAuth(req as any); 
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

    const { youtubeUrl, languageTarget, format } = validationResult.data;

    const YOUTUBE_ID_REGEX = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/; // Ensure this regex is robust
    const match = youtubeUrl.match(YOUTUBE_ID_REGEX);
    const youtubeVideoId = match ? match[1] : null;

    if (!youtubeVideoId) {
      return NextResponse.json({ error: "Could not extract YouTube Video ID from URL." }, { status: 400 });
    }

    console.log(`[API POST /api/streams] Creating stream for user: ${clerkUserId}, YT ID: ${youtubeVideoId}`);
    const newStream = await prisma.stream.create({
      data: {
        youtube_video_id: youtubeVideoId, 
        status: "pending_ingestion", 
        listener_id: clerkUserId,
        language_target: languageTarget || 'es',
        // format: format || 'video-audio', // Uncomment if you add 'format' to your Stream model in Prisma
        started_at: new Date(),
      },
    });
    console.log('[API POST /api/streams] Stream created in DB:', newStream);

    // LiveKit Token Generation logic is now completely removed.

    return NextResponse.json(
      {
        streamId: newStream.id,
        youtubeVideoId: newStream.youtube_video_id, // Return the extracted ID
        status: newStream.status,
        languageTarget: newStream.language_target,
        format: format || 'video-audio' // Return format, or what was used/defaulted
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Error creating stream in /api/streams POST:", error);
    return NextResponse.json({ error: "Failed to create stream" }, { status: 500 });
  }
}

/**
 * Handles GET requests to the /api/streams endpoint.
 * Returns a list of streams for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId } = getAuth(req as any); 
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[API GET /api/streams] Fetching streams for user: ${clerkUserId}`);
    const streams = await prisma.stream.findMany({
      where: {
        listener_id: clerkUserId,
      },
      orderBy: {
        started_at: 'desc',
      },
    });

    return NextResponse.json(streams, { status: 200 });

  } catch (error) {
    console.error("Error fetching streams from /api/streams GET:", error);
    return NextResponse.json({ error: "Failed to fetch streams" }, { status: 500 });
  }
} 