import { NextResponse } from 'next/server';

/**
 * Handles GET requests to the /api/health endpoint.
 * Returns a simple health check response.
 */
export async function GET() {
  try {
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    // Should be unlikely for this simple endpoint, but good practice
    console.error("Error in /api/health:", error);
    return NextResponse.json(
      { status: "error", message: "Health check endpoint failed" },
      { status: 500 }
    );
  }
} 