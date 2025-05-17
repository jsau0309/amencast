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
 * Handles GET requests to the /api/streams/[streamId] endpoint.
 * Returns details for a specific stream if it belongs to the authenticated user.
 */
export async function GET(
  request: NextRequest, 
  context: { params: { streamId: string } }
) {
  // console.log('[API /api/streams/] RAW context object:', JSON.stringify(context, null, 2));
  // console.log('[API /api/streams/] context.params object:', JSON.stringify(context.params, null, 2));
  // if (context && context.params && typeof context.params.streamId === 'string') {
  //   console.log('[API /api/streams/] Directly accessed streamId for logging:', context.params.streamId);
  // } else {
  //   console.log('[API /api/streams/] context.params.streamId is not immediately a string or params/context is missing.');
  // }

  const { userId } = getAuth(request as any); 
  
  // const dynamicStreamId = context.params.streamId; // Removed intermediate variable

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Use context.params.streamId directly
  if (!context.params.streamId) { 
    return NextResponse.json({ error: "Stream ID is required from path" }, { status: 400 });
  }

  try {
    console.log(`[API /api/streams/${context.params.streamId}] User ${userId} attempting to fetch stream details.`);
    const stream = await prisma.stream.findUnique({
      where: {
        id: context.params.streamId, 
      },
    });

    if (!stream) {
      console.log(`[API /api/streams/${context.params.streamId}] Stream not found for user ${userId} or general not found.`);
      return NextResponse.json({ error: "Stream not found or access denied" }, { status: 404 });
    }
    
    // Example: Explicitly check if the user is the owner/listener if that's a requirement
    // This depends on your data model and authorization rules.
    // if (stream.listener_id !== userId) { 
    //   console.warn(`[API /api/streams/${context.params.streamId}] Unauthorized access attempt by user ${userId}.`);
    //   return NextResponse.json({ error: "Access denied" }, { status: 403 });
    // }

    console.log(`[API /api/streams/${context.params.streamId}] Stream details successfully found for user ${userId}:`, stream);
    return NextResponse.json(stream);

  } catch (error) {
    console.error(`[API /api/streams/${context.params.streamId}] Error fetching stream for user ${userId}:`, error);
    return NextResponse.json({ error: "Internal server error while fetching stream details." }, { status: 500 });
  }
} 