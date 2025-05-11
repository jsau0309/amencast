"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button"; // Assuming you have this path for Button

function TokenDisplay() {
  const { getToken, isSignedIn, userId, sessionClaims } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAndSetToken = async () => {
    setError(null);
    if (isSignedIn) {
      try {
        const t = await getToken();
        setToken(t);
      } catch (e: any) {
        console.error("Error fetching token in TokenDisplay:", e);
        setError(e.message || "Failed to fetch token");
        setToken(null);
      }
    } else {
      setToken(null);
    }
  };

  useEffect(() => {
    fetchAndSetToken();
  }, [isSignedIn]); // Re-fetch if isSignedIn changes

  if (!isSignedIn) {
    return (
      <div style={{ border: '1px solid red', padding: '10px', margin: '10px 0' }}>
        <p>TokenDisplay: Not signed in.</p>
        <Button onClick={fetchAndSetToken}>Attempt to Fetch Token</Button>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid green', padding: '10px', margin: '10px 0', wordBreak: 'break-all' }}>
      <h3>Token Display Component (Debug)</h3>
      <p><strong>User ID:</strong> {userId}</p>
      <p><strong>Session ID (sid from claims):</strong> {sessionClaims?.sid || 'N/A'}</p>
      <p><strong>Token Issued At (iat):</strong> {sessionClaims?.iat ? new Date(sessionClaims.iat * 1000).toLocaleString() : 'N/A'}</p>
      <p><strong>Token Expires At (exp):</strong> {sessionClaims?.exp ? new Date(sessionClaims.exp * 1000).toLocaleString() : 'N/A'}</p>
      <p><strong>Full Token:</strong> {token || "Loading or no token..."}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      <Button onClick={fetchAndSetToken} variant="outline" style={{ marginTop: '10px' }}>Refresh Token Display</Button>
    </div>
  );
}

export default TokenDisplay; 