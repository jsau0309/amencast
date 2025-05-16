import axios, { AxiosError } from 'axios';

export class ElevenLabsClient {
  private apiKey: string;
  private baseURL: string;
  private client: ReturnType<typeof axios.create>;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.elevenlabs.io/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  async streamTTS(text: string, options: {
    voice_id?: string;
    model_id?: string;
  } = {}): Promise<NodeJS.ReadableStream> {
    try {
      const response = await this.client.post(
        `/text-to-speech/${options.voice_id || 'default'}/stream`,
        {
          text,
          model_id: options.model_id || 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          }
        },
        { responseType: 'stream' }
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('ElevenLabs API error:', 
        axiosError.response?.data || axiosError.message
      );
      throw error;
    }
  }
} 