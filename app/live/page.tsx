"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LanguageToggle } from "@/components/language-toggle";
import { SettingsButton } from "@/components/settings-button";
import { Volume2, VolumeX, Video, X, Headphones, MessageCircleQuestion, Loader2 as SpinnerIcon } from "lucide-react";
import { SignedIn, SignedOut, UserButton, SignInButton, useAuth } from "@clerk/nextjs";
import ReactPlayer from 'react-player/youtube';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getSocket } from '../lib/socket'; // Assuming your socket helper is here

// Define a type for the stream details we expect from the API (if still used)
interface StreamDetails {
  id: string;
  youtube_video_id: string;
  status: string;
  // listener_id: string; // From your original interface, include if still relevant
  // started_at: string;  // From your original interface, include if still relevant
  // ended_at?: string | null; // From your original interface, include if still relevant
}

// Define types for Socket.IO data
interface TranslationResultData {
  streamId: string;
  status: 'success' | 'error';
  sourceText?: string;
  translatedText?: string;
  finalAudioUrl?: string;
  errorMessage?: string;
}

const FEEDBACK_OPTIONS = [
  { value: "AUDIO_LAG", label: "Audio Lag / Sync Issues" },
  { value: "WRONG_VERSE", label: "Incorrect Bible Verse" },
  { value: "TRANSLATION_QUALITY", label: "Poor Translation Quality" },
  { value: "TECHNICAL_ISSUE", label: "Other Technical Issue" },
  { value: "OTHER", label: "Other Feedback" },
];

export default function LivestreamPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();

  const streamIdFromUrl = searchParams.get("streamId");
  const lang = searchParams.get("lang") || "es";
  const initialFormat = searchParams.get("format") || "video-audio";

  const [streamDetails, setStreamDetails] = useState<StreamDetails | null>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [initialDataLoading, setInitialDataLoading] = useState(true);
  const [initialDataError, setInitialDataError] = useState<string | null>(null);

  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [finalAudioUrl, setFinalAudioUrl] = useState('');
  const [isTranslationLoading, setIsTranslationLoading] = useState(true);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const [currentFormat, setCurrentFormat] = useState(initialFormat);
  const [isPlayingTranslatedAudio, setIsPlayingTranslatedAudio] = useState(false);

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackCode, setFeedbackCode] = useState<string>("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null);

  const translatedAudioPlayerRef = useRef<HTMLAudioElement>(null);
  const youtubePlayerRef = useRef<ReactPlayer>(null);

  // Effect 1: Fetch initial stream details (like YouTube video ID)
  useEffect(() => {
    if (!streamIdFromUrl) {
      setInitialDataError("Stream ID is missing from URL.");
      setInitialDataLoading(false);
      setIsTranslationLoading(false); // Also stop translation loading if no streamId
      return;
    }

    const fetchStreamDetails = async () => {
      setInitialDataLoading(true);
      setInitialDataError(null);
      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          setInitialDataError("Not authenticated to fetch stream details.");
          setInitialDataLoading(false);
          return;
        }

        const response = await fetch(`/api/streams/${streamIdFromUrl}`, {
          headers: { Authorization: `Bearer ${clerkToken}` },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          setInitialDataError(errData.error || `Failed to fetch stream details (status: ${response.status}).`);
          setInitialDataLoading(false);
          return;
        }
        const data: StreamDetails = await response.json();
        setStreamDetails(data);
        if (data.youtube_video_id) {
          setYoutubeVideoId(`https://www.youtube.com/watch?v=${data.youtube_video_id}`);
        } else {
          setInitialDataError("YouTube video ID not found in stream details.");
        }
      } catch (e: any) {
        console.error("Error fetching stream details:", e);
        setInitialDataError(e.message || "An error occurred while fetching stream details.");
      }
      setInitialDataLoading(false);
    };

    fetchStreamDetails();
  }, [streamIdFromUrl, getToken]);

  // Effect 2: Handle Socket.IO communication for translation results
  useEffect(() => {
    if (!streamIdFromUrl) {
        setTranslationError("Stream ID is missing, cannot listen for translations.");
        setIsTranslationLoading(false);
        return;
    }

    const socket = getSocket();
    if (!socket.connected) {
        console.log("[LivePage] Socket not initially connected, attempting to connect...");
        socket.connect();
    }
    
    console.log(`[LivePage] Setting up Socket.IO listeners for streamId: ${streamIdFromUrl}`);
    setIsTranslationLoading(true);
    setTranslationError(null);
    // Reset previous translation data when a new streamId is processed or page loads
    setSourceText('');
    setTranslatedText('');
    setFinalAudioUrl('');
    setIsPlayingTranslatedAudio(false);


    const handleTranslationResult = (data: TranslationResultData) => {
      if (data.streamId === streamIdFromUrl) {
        console.log('[LivePage] Received translation_result:', data);
        if (data.status === 'success') {
          setSourceText(data.sourceText || 'N/A');
          setTranslatedText(data.translatedText || 'N/A');
          setFinalAudioUrl(data.finalAudioUrl || '');
          setTranslationError(null);
          // Auto-play translated audio when it arrives if a URL is present.
          // User can then pause it using controls.
          if (data.finalAudioUrl) {
            setIsPlayingTranslatedAudio(true);
          }
        } else {
          setTranslationError(data.errorMessage || 'An error occurred during translation process.');
          setFinalAudioUrl(''); // Clear any old audio URL on error
        }
        setIsTranslationLoading(false);
      }
    };

    const handleServerError = (data: { streamId?: string; message: string; clientRequestId?:string }) => {
      // Only handle error if it's for the current stream or if no streamId specified (could be general)
      if (data.streamId === streamIdFromUrl || (!data.streamId && data.message)) {
        console.error('[LivePage] Received error from server:', data);
        setTranslationError(data.message || 'A server error occurred.');
        setIsTranslationLoading(false);
        setFinalAudioUrl(''); // Clear audio URL on error
      }
    };

    socket.on('translation_result', handleTranslationResult);
    socket.on('translation_error', handleServerError);
    socket.on('request_error', handleServerError); // For errors from websocket-server during initial request phase

    return () => {
      console.log(`[LivePage] Cleaning up Socket.IO listeners for streamId: ${streamIdFromUrl}`);
      socket.off('translation_result', handleTranslationResult);
      socket.off('translation_error', handleServerError);
      socket.off('request_error', handleServerError);
    };
  }, [streamIdFromUrl]); // Re-run if streamIdFromUrl changes

  // Effect 3: Control translated audio playback via state
  useEffect(() => {
    const audioEl = translatedAudioPlayerRef.current;
    if (audioEl && finalAudioUrl) { // Ensure there's a URL to play
      if (isPlayingTranslatedAudio) {
        audioEl.load(); // Important to load the new src if finalAudioUrl changes
        audioEl.play().catch(e => console.warn("Error trying to play translated audio:", e));
      } else {
        audioEl.pause();
      }
    }
  }, [isPlayingTranslatedAudio, finalAudioUrl]);


  const handleFeedbackSubmit = async () => {
    if (!feedbackCode || !streamIdFromUrl) {
      setFeedbackSubmitError("Please select a reason for your feedback.");
      return;
    }
    setIsSubmittingFeedback(true);
    setFeedbackSubmitError(null);
    try {
      const clerkToken = await getToken();
      if (!clerkToken) {
        setFeedbackSubmitError("Authentication required to submit feedback.");
        setIsSubmittingFeedback(false);
        return;
      }
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clerkToken}`},
        body: JSON.stringify({ streamId: streamIdFromUrl, code: feedbackCode, note: feedbackNote }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "An unknown error occurred." }));
        setFeedbackSubmitError(errorData.error || `Failed to submit feedback: ${response.statusText}`);
      } else {
        toast.success("Feedback submitted! Thank you.");
        setIsFeedbackModalOpen(false); setFeedbackCode(""); setFeedbackNote("");
      }
    } catch (err: any) {
      console.error("Error submitting feedback:", err);
      setFeedbackSubmitError(err.message || "An unexpected error occurred.");
    }
    setIsSubmittingFeedback(false);
  };

  const toggleTranslatedAudioPlayback = () => {
    if (!finalAudioUrl) return; // Don't toggle if no audio is loaded
    setIsPlayingTranslatedAudio(prev => !prev);

    if (currentFormat === "video-audio" && youtubePlayerRef.current) {
        const internalPlayer = youtubePlayerRef.current.getInternalPlayer();
        if (internalPlayer && typeof internalPlayer.mute === 'function' && typeof internalPlayer.unMute === 'function') {
            // If we are about to play our translation, mute the YouTube player.
            // If we are about to pause our translation, user might want to hear original, so unmute.
            if (!isPlayingTranslatedAudio) { // Condition is before state update, so !isPlaying means "will be playing"
                internalPlayer.mute();
            } else {
                // internalPlayer.unMute(); // Or let user control this manually
            }
        }
    }
  };

  const switchToAudioMode = () => setCurrentFormat("audio-only");
  const switchToVideoMode = () => setCurrentFormat("video-audio");
  const goBackToSubmit = () => router.push("/submit");

  if (initialDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SpinnerIcon className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading stream data...</p>
      </div>
    );
  }

  if (initialDataError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Error Loading Stream Data</h1>
          <p className="mt-2 text-muted-foreground">{initialDataError}</p>
          <Button className="mt-4" onClick={goBackToSubmit}>Go Back</Button>
        </div>
      </div>
    );
  }
  
  if (!streamDetails || !youtubeVideoId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Stream Data Incomplete</h1>
          <p className="mt-2 text-muted-foreground">Essential stream information is missing. Please try starting again.</p>
          <Button className="mt-4" onClick={goBackToSubmit}>Go Back</Button>
        </div>
      </div>
    );
  }

  const feedbackModal = (
    <Dialog open={isFeedbackModalOpen} onOpenChange={setIsFeedbackModalOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>Let us know what went wrong. Your feedback helps us improve.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="feedbackCode" className="text-right">Reason</Label>
            <RadioGroup id="feedbackCode" value={feedbackCode} onValueChange={setFeedbackCode} className="col-span-3">
              {FEEDBACK_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={`rb-${option.value}`} />
                  <Label htmlFor={`rb-${option.value}`}>{option.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="feedbackNote" className="text-right">Details</Label>
            <Textarea id="feedbackNote" value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} placeholder="Optional: provide more details..." className="col-span-3"/>
          </div>
          {feedbackSubmitError && (<p className="col-span-4 text-sm text-destructive text-center">{feedbackSubmitError}</p>)}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="button" onClick={handleFeedbackSubmit} disabled={isSubmittingFeedback || !feedbackCode}>
            {isSubmittingFeedback && <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />}Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const translationDisplay = (
    <div className="my-4 p-4 border rounded-md bg-background shadow-md">
      {isTranslationLoading && !finalAudioUrl && ( // Show loading only if we don't have a result yet
        <div className="flex items-center justify-center py-8">
          <SpinnerIcon className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-3 text-lg">Translating, please wait...</p>
        </div>
      )}
      {translationError && (
        <div className="text-center py-4">
            <p className="text-destructive text-lg">Translation Error:</p>
            <p className="text-muted-foreground">{translationError}</p>
        </div>
      )}
      {finalAudioUrl && !translationError && (
        <div className="space-y-3">
          <h3 className="font-semibold text-xl mb-2">Translated Audio ({lang.toUpperCase()}):</h3>
          <audio ref={translatedAudioPlayerRef} controls src={finalAudioUrl} className="w-full">
            Your browser does not support the audio element.
          </audio>
           <p className="text-sm text-muted-foreground mt-1">
             {isPlayingTranslatedAudio ? "Playing translated audio" : "Translated audio ready"}
           </p>
        </div>
      )}
      {sourceText && !translationError && (
        <div className="mt-4">
          <h3 className="font-semibold text-lg">Original Text (Detected):</h3>
          <Textarea value={sourceText} readOnly rows={3} className="mt-1 w-full bg-muted/20 text-sm" />
        </div>
      )}
      {translatedText && !translationError && (
        <div className="mt-4">
          <h3 className="font-semibold text-lg">Translated Text ({lang.toUpperCase()}):</h3>
          <Textarea value={translatedText} readOnly rows={3} className="mt-1 w-full bg-muted/20 text-sm" />
        </div>
      )}
    </div>
  );

  if (currentFormat === "audio-only") {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="container flex items-center justify-between py-5">
            <Logo />
            <div className="flex items-center gap-2"> <SettingsButton /> <LanguageToggle /> <SignedIn><UserButton afterSignOutUrl="/" /></SignedIn><SignedOut><SignInButton /></SignedOut></div>
        </header>
        <main className="container flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-md flex flex-col items-center">
            <div className="relative w-64 h-64 mb-8">
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-50/40 to-orange-500/40 animate-pulse-slow"></div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-50 to-orange-500 shadow-lg animate-pulse-subtle flex items-center justify-center">
                <div className="w-1/2 h-1/2 rounded-full bg-gradient-to-b from-orange-300/80 to-amber-50/80 animate-pulse-fast"></div>
              </div>
            </div>
            
            {translationDisplay} 

            <div className="flex items-center justify-center gap-8 mt-auto py-8">
              <Button onClick={toggleTranslatedAudioPlayback} variant={isPlayingTranslatedAudio ? "default" : "outline"} size="icon" className="h-16 w-16 rounded-full" disabled={!finalAudioUrl || isTranslationLoading}>
                {isPlayingTranslatedAudio ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={switchToVideoMode}><Video className="h-6 w-6" /></Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={() => setIsFeedbackModalOpen(true)}><MessageCircleQuestion className="h-6 w-6" /></Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={goBackToSubmit}><X className="h-6 w-6" /></Button>
            </div>
          </div>
          {feedbackModal}
        </main>
      </div>
    );
  }

  // Video + Audio mode
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <div className="flex items-center gap-2"><SettingsButton /><LanguageToggle /><SignedIn><UserButton afterSignOutUrl="/" /></SignedIn><SignedOut><SignInButton /></SignedOut></div>
      </header>
      <main className="container flex-1 py-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {youtubeVideoId && (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <ReactPlayer
                ref={youtubePlayerRef}
                url={youtubeVideoId}
                playing={true} // Consider making this pausable by user
                muted={isPlayingTranslatedAudio && !!finalAudioUrl} // Mute original if translated audio is playing (or about to play)
                controls={true}
                width="100%"
                height="100%"
                onError={(e) => console.error('ReactPlayer error:', e)}
                onReady={() => console.log('ReactPlayer ready')}
              />
            </div>
          )}
          
          {translationDisplay}

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-8 mt-4">
                <Button onClick={toggleTranslatedAudioPlayback} variant={isPlayingTranslatedAudio ? "default" : "outline"} size="icon" className="h-16 w-16 rounded-full" disabled={!finalAudioUrl || isTranslationLoading}>
                    {isPlayingTranslatedAudio ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                </Button>
                <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={switchToAudioMode}><Headphones className="h-6 w-6" /></Button>
                <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={() => setIsFeedbackModalOpen(true)}><MessageCircleQuestion className="h-6 w-6" /></Button>
                <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={goBackToSubmit}><X className="h-6 w-6" /></Button>
            </div>
          </div>
          {feedbackModal}
        </div>
      </main>
    </div>
  );
}