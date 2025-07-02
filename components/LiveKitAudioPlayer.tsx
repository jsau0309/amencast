"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

interface LiveKitAudioPlayerProps {
  streamId: string;
  onPlaybackStateChange: (isPlaying: boolean) => void;
  onError: (error: string) => void;
  onTranslationComplete: () => void;
}

// Inner component that uses LiveKit hooks
function AudioPlayerInner({ onPlaybackStateChange, onError, onTranslationComplete }: Omit<LiveKitAudioPlayerProps, 'streamId'>) {
  const room = useRoomContext();
  const participants = useRemoteParticipants();
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  
  // Log when participants join/leave
  useEffect(() => {
    console.log(`👥 Participants in room: ${participants.length}`);
    participants.forEach(p => {
      console.log(`👤 Participant: ${p.identity} - Audio tracks: ${p.audioTrackPublications.size}`);
    });
  }, [participants]);
  
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);

  useEffect(() => {
    const hasAudioTracks = audioTracks.length > 0 && audioTracks.some(track => track.publication.isSubscribed);
    setIsReceivingAudio(hasAudioTracks);
    onPlaybackStateChange(hasAudioTracks);
  }, [audioTracks, onPlaybackStateChange]);

  useEffect(() => {
    // Listen for room events
    const handleDisconnected = () => {
      console.log('LiveKit room disconnected');
      onTranslationComplete();
    };

    const handleParticipantDisconnected = () => {
      console.log('Translation bot disconnected - translation complete');
      onTranslationComplete();
    };

    room.on('disconnected', handleDisconnected);
    room.on('participantDisconnected', handleParticipantDisconnected);

    return () => {
      room.off('disconnected', handleDisconnected);
      room.off('participantDisconnected', handleParticipantDisconnected);
    };
  }, [room, onTranslationComplete]);

  return (
    <>
      <RoomAudioRenderer />
      <div className="text-sm text-muted-foreground">
        Connected participants: {participants.length}
        {isReceivingAudio && <span className="ml-2 text-green-600">• Receiving audio</span>}
      </div>
    </>
  );
}

export function LiveKitAudioPlayer({ streamId, onPlaybackStateChange, onError, onTranslationComplete }: LiveKitAudioPlayerProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);

  const generateToken = useCallback(async () => {
    try {
      setIsConnecting(true);
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: streamId,
          participantName: `listener-${Date.now()}`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.statusText}`);
      }

      const data = await response.json();
      setToken(data.token);
    } catch (error) {
      console.error('Error getting LiveKit token:', error);
      onError(error instanceof Error ? error.message : 'Failed to connect to audio stream');
    } finally {
      setIsConnecting(false);
    }
  }, [streamId, onError]);

  useEffect(() => {
    generateToken();
  }, [generateToken]);

  const handleError = useCallback((error: Error) => {
    console.error('LiveKit room error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    onError(`LiveKit connection failed: ${error.message}`);
  }, [onError]);

  const handleConnected = useCallback(() => {
    console.log('✅ SUCCESS: Connected to LiveKit room!');
    console.log('🎵 Waiting for audio from other participants...');
    setIsConnecting(false);
  }, []);

  if (isConnecting || !token) {
    return (
      <div className="text-sm text-muted-foreground">
        Connecting to audio stream...
      </div>
    );
  }

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  
  if (!serverUrl) {
    return (
      <div className="text-sm text-destructive">
        LiveKit server URL not configured. Please check NEXT_PUBLIC_LIVEKIT_URL environment variable.
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connectOptions={{ autoSubscribe: false }}
      audio={false}
      video={false}
      onError={handleError}
      onConnected={handleConnected}
    >
      <AudioPlayerInner 
        onPlaybackStateChange={onPlaybackStateChange}
        onError={onError}
        onTranslationComplete={onTranslationComplete}
      />
    </LiveKitRoom>
  );
} 