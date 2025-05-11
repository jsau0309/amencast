import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/utils'; // Ensure this path is correct

interface RouteParams {
  params: {
    streamId: string;
  };
}

/**
 * Handles GET requests to the /api/transcripts/[streamId] endpoint.
 * Returns a list of transcripts for a specific stream if it belongs to the authenticated user.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { streamId } = params;

    if (!streamId) {
      return NextResponse.json({ error: "Stream ID is required" }, { status: 400 });
    }

    // Authorization: Check if the user owns the stream associated with the transcripts
    const stream = await prisma.stream.findFirst({
      where: {
        id: streamId,
        listener_id: clerkUserId,
      },
      select: { id: true } // We only need to know if it exists and is owned by the user
    });

    if (!stream) {
      // If stream doesn't exist or doesn't belong to the user, deny access to transcripts
      return NextResponse.json({ error: "Stream not found or access denied to its transcripts" }, { status: 404 });
    }

    // Fetch transcripts for the validated streamId
    const transcripts = await prisma.transcript.findMany({
      where: {
        stream_id: streamId,
      },
      orderBy: {
        start_ts: 'asc',
      },
    });

    return NextResponse.json(transcripts, { status: 200 });

  } catch (error) {
    console.error(`Error fetching transcripts for stream ${params?.streamId}:`, error);
    return NextResponse.json({ error: "Failed to fetch transcripts" }, { status: 500 });
  }
} 