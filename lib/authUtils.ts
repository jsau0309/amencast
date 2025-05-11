import jwt from 'jsonwebtoken';

/**
 * Mints a Supabase-compatible JWT for a given Clerk User ID.
 * This token can be used to initialize a Supabase client instance that will respect RLS policies
 * where auth.uid() is expected to be the Clerk User ID.
 *
 * @param clerkUserId The User ID from Clerk.
 * @returns A signed JWT string.
 * @throws Error if required environment variables (SUPABASE_JWT_SECRET, NEXT_PUBLIC_SUPABASE_URL) are missing.
 */
export function mintSupabaseToken(clerkUserId: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!supabaseUrl) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseJwtSecret) {
    throw new Error('Missing environment variable: SUPABASE_JWT_SECRET');
  }

  const payload = {
    sub: clerkUserId,
    iss: supabaseUrl, // Issuer: your Supabase project URL
    role: 'authenticated', // Standard role for authenticated users in Supabase
    // Set an expiration time for the token, e.g., 1 hour
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour in seconds
    // You can add other claims if needed by your RLS policies or functions
    // e.g., aud: 'authenticated'
  };

  try {
    const token = jwt.sign(payload, supabaseJwtSecret);
    return token;
  } catch (error) {
    console.error('Error minting Supabase token:', error);
    throw new Error('Failed to mint Supabase token.');
  }
} 