/**
 * Standardized Redis channel names for the AmenCast pipeline
 * This file ensures consistency across all services
 */

export const REDIS_CHANNELS = {
  // Audio data channels
  AUDIO_RAW: (streamId: string) => `audio:raw:${streamId}`,
  AUDIO_SYNTHESIZED: (streamId: string) => `audio:synthesized:${streamId}`,
  
  // Text data channels  
  TEXT_TRANSCRIBED: (streamId: string) => `text:transcribed:${streamId}`,
  TEXT_TRANSLATED: (streamId: string) => `text:translated:${streamId}`,
  
  // Control and status channels
  STREAM_CONTROL: 'stream:control',
  STREAM_STATUS: (streamId: string) => `stream:status:${streamId}`,
  
  // Pattern subscriptions
  PATTERNS: {
    AUDIO_RAW: 'audio:raw:*',
    AUDIO_SYNTHESIZED: 'audio:synthesized:*',
    TEXT_TRANSCRIBED: 'text:transcribed:*',
    TEXT_TRANSLATED: 'text:translated:*',
    STREAM_STATUS: 'stream:status:*'
  }
};

// Control message types
export interface ControlMessage {
  action: 'start' | 'stop' | 'pause' | 'resume' | 'force_stop' | 'ingestion_complete';
  streamId: string;
  targetLanguage?: string;
  timestamp?: number;
}

// Status message types
export interface StatusMessage {
  status: 'starting' | 'running' | 'completed' | 'error' | 'stopped';
  service: 'ingestion' | 'stt' | 'translation' | 'tts';
  streamId: string;
  timestamp: number;
  error?: string;
  metadata?: Record<string, any>;
}