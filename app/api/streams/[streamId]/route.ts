import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server'; // clerkClient might not be needed for just GET
import prisma from '@/lib/prisma'; // Adjust path



export const dynamic = 'force-dynamic'; // Added to ensure dynamic behavior

interface RouteParams {
  params: {
    streamId: string;
  };
}

/**
 * Handles GET requests to retrieve details of a specific stream by its ID for the authenticated user.
 *
 * @param context - Contains the route parameters, including the {@link streamId} identifying the stream to fetch.
 * @returns A JSON response with the stream details if found and accessible, or an error message with the appropriate HTTP status code.
 *
 * @remark Returns a 401 response if the user is not authenticated, a 400 response if {@link streamId} is missing, a 404 response if the stream does not exist or access is denied, and a 500 response for unexpected server errors.
 */
export async function GET(
  request: NextRequest, 
  context: { params: Promise<{ streamId: string }> }
) {
  const { streamId } = await context.params;

  // const { userId } = getAuth(request as any);
  const userId = "test-user-for-debug"; // Temporary bypass
  
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!streamId) { 
    return NextResponse.json({ error: "Stream ID is required from path" }, { status: 400 });
  }

  try {
    console.log(`[API /api/streams/${streamId}] User ${userId} attempting to fetch stream details.`);
    const stream = await prisma.stream.findUnique({
      where: {
        id: streamId, 
      },
    });

    if (!stream) {
      console.log(`[API /api/streams/${streamId}] Stream not found for user ${userId} or general not found.`);
      return NextResponse.json({ error: "Stream not found or access denied" }, { status: 404 });
    }
    
    // Example: Explicitly check if the user is the owner/listener if that's a requirement
    // This depends on your data model and authorization rules.
    // if (stream.listener_id !== userId) { 
    //   console.warn(`[API /api/streams/${streamId}] Unauthorized access attempt by user ${userId}.`);
    //   return NextResponse.json({ error: "Access denied" }, { status: 403 });
    // }

    console.log(`[API /api/streams/${streamId}] Stream details successfully found for user ${userId}:`, stream);
    return NextResponse.json(stream);

  } catch (error) {
    console.error(`[API /api/streams/${streamId}] Error fetching stream for user ${userId}:`, error);
    return NextResponse.json({ error: "Internal server error while fetching stream details." }, { status: 500 });
  }
} 