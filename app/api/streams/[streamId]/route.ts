import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/utils'; // Ensure this path is correct

export const dynamic = 'force-dynamic'; // Added to ensure dynamic behavior

interface RouteParams {
  params: {
    streamId: string;
  };
}

/**
 * Handles GET requests to the /api/streams/[streamId] endpoint.
 * Returns details for a specific stream if it belongs to the authenticated user.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { streamId } = params;

    // Basic validation: Check if streamId is provided (though Next.js routing usually ensures this)
    if (!streamId) {
      return NextResponse.json({ error: "Stream ID is required" }, { status: 400 });
    }

    // Optional: Validate streamId format (e.g., is UUID) if desired, e.g. using Zod
    // For now, we rely on Prisma to handle non-UUIDs gracefully in its query.

    const stream = await prisma.stream.findFirst({
      where: {
        id: streamId,
        listener_id: clerkUserId, // Ensures the stream belongs to the authenticated user
      },
      // You can include related data if needed in the future, e.g.:
      // include: { feedback: true, transcripts: true }
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found or access denied" }, { status: 404 });
    }

    return NextResponse.json(stream, { status: 200 });

  } catch (error) {
    console.error(`Error fetching stream ${params?.streamId}:`, error);
    return NextResponse.json({ error: "Failed to fetch stream" }, { status: 500 });
  }
} 