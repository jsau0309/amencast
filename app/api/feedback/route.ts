import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/utils'; // Ensure this path is correct for your Prisma instance

// Input schema for feedback validation
const CreateFeedbackSchema = z.object({
  streamId: z.string().uuid({ message: "Invalid Stream ID" }),
  code: z.string().min(1, { message: "Feedback code cannot be empty" }), // e.g., "AUDIO_LAG", "WRONG_VERSE", "OTHER"
  note: z.string().optional(), // Optional note
});

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = CreateFeedbackSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { streamId, code, note } = validationResult.data;

    // Authorization Check: Ensure the user owns the stream for which they are providing feedback
    const stream = await prisma.stream.findFirst({
      where: {
        id: streamId,
        listener_id: clerkUserId, // Check if the stream belongs to the authenticated user
      },
    });

    if (!stream) {
      // If stream doesn't exist or doesn't belong to the user, deny permission
      // Return 404 if stream not found, or 403 if found but not owned by user (can be combined for simplicity)
      return NextResponse.json({ error: "Stream not found or access denied" }, { status: 404 });
    }

    // Database Interaction (Prisma): Create the feedback entry
    await prisma.feedback.create({
      data: {
        stream_id: streamId,
        code: code,
        note: note,
        // listener_id could be added here if feedback table schema had it directly for easier querying of user's own feedback
        // but our RLS for feedback already joins with streams table to check listener_id.
      },
    });

    return new NextResponse(null, { status: 204 }); // 204 No Content for successful POST without returning data

  } catch (error) {
    console.error("Error creating feedback:", error);
    // Generic error for the client
    return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
  }
} 