"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function TestLivePage() {
  const router = useRouter();

  const goToLiveTest = () => {
    // Use a fixed test room that we can join from multiple devices
    const testRoomName = 'amencast-test-room-123';
    router.push(`/live?streamId=${testRoomName}&lang=es&format=audio-only`);
  };

  const openMobileJoin = () => {
    // Open LiveKit Meet for mobile joining
    window.open('https://meet.livekit.io/', '_blank');
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6 max-w-2xl p-8">
        <h1 className="text-3xl font-bold">Test LiveKit Audio Streaming</h1>
        
        <div className="space-y-4 text-left bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold">How to Test:</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li><strong>Step 1:</strong> Click "Join Test Room" below</li>
            <li><strong>Step 2:</strong> Click "Open Mobile Join" to open LiveKit Meet</li>
            <li><strong>Step 3:</strong> On your phone, enter room name: <code className="bg-gray-200 px-2 py-1 rounded">amencast-test-room-123</code></li>
            <li><strong>Step 4:</strong> Speak into your phone's microphone</li>
            <li><strong>Step 5:</strong> You should hear your voice on this computer!</li>
          </ol>
        </div>

        <div className="space-y-4">
          <Button onClick={goToLiveTest} className="w-full" size="lg">
            Join Test Room (Computer - Listener)
          </Button>
          
          <Button onClick={openMobileJoin} variant="outline" className="w-full" size="lg">
            Open Mobile Join (Phone - Speaker)
          </Button>
        </div>

        <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg">
          <p><strong>What this tests:</strong></p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>LiveKit credentials are working</li>
            <li>Frontend can connect to LiveKit</li>
            <li>Audio streaming works end-to-end</li>
            <li>Your UI components work correctly</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 