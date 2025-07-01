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
import { audioSocketManager } from '../lib/AudioSocketManager';
import { AudioPlayer } from '../lib/AudioPlayer';

interface StreamDetails {
  id: string;
  youtube_video_id: string;
  status: string;
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

  const [translationError, setTranslationError] = useState<string | null>(null);
  const [isTranslationCompleted, setIsTranslationCompleted] = useState(false);

  const [currentFormat, setCurrentFormat] = useState(initialFormat);
  const [isPlayingTranslatedAudio, setIsPlayingTranslatedAudio] = useState(false);

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackCode, setFeedbackCode] = useState<string>("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const youtubePlayerRef = useRef<ReactPlayer>(null);

  useEffect(() => {
    if (!streamIdFromUrl) {
      setInitialDataError("Stream ID is missing from URL.");
      setInitialDataLoading(false);
      return;
    }
    
    const player = new AudioPlayer({ onPlaybackStateChange: setIsPlayingTranslatedAudio });
    playerRef.current = player;
    
    audioSocketManager.startAudioStream(streamIdFromUrl, (audioChunk) => {
        player.addChunk(audioChunk);
    }, (error) => {
        if(error) {
            console.error('[LivePage] Received error from audio stream:', error);
            setTranslationError(error.message || 'A stream error occurred.');
        } else {
            console.log(`[LivePage] Translation completed for stream ${streamIdFromUrl}`);
            setIsTranslationCompleted(true);
        }
    });

    const fetchStreamDetails = async () => {
      setInitialDataLoading(true);
      setInitialDataError(null);
      try {
        // Using a test user ID as per previous temporary fix
        const response = await fetch(`/api/streams/${streamIdFromUrl}`, {
          headers: { Authorization: `Bearer FAKE_TOKEN` },
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          setInitialDataError(errData.error || `Failed to fetch stream details (status: ${response.status}).`);
        } else {
          const data: StreamDetails = await response.json();
          setStreamDetails(data);
          if (data.youtube_video_id) {
            setYoutubeVideoId(`https://www.youtube.com/watch?v=${data.youtube_video_id}`);
          } else {
            setInitialDataError("YouTube video ID not found in stream details.");
          }
        }
      } catch (e: any) {
        console.error("Error fetching stream details:", e);
        setInitialDataError(e.message || "An error occurred while fetching stream details.");
      }
      setInitialDataLoading(false);
    };

    fetchStreamDetails();

    return () => {
      console.log(`[LivePage] Cleaning up for streamId: ${streamIdFromUrl}`);
      audioSocketManager.stopAudioStream(streamIdFromUrl);
      player.stop();
    };
  }, [streamIdFromUrl]);

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
    if (playerRef.current) {
        if (isPlayingTranslatedAudio) {
            playerRef.current.pause();
        } else {
            playerRef.current.play();
        }
    }

    if (currentFormat === "video-audio" && youtubePlayerRef.current) {
        const internalPlayer = youtubePlayerRef.current.getInternalPlayer();
        if (internalPlayer && typeof internalPlayer.mute === 'function' && typeof internalPlayer.unMute === 'function') {
            if (!isPlayingTranslatedAudio) {
                internalPlayer.mute();
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
    <div className="my-4 p-4 border rounded-md bg-background shadow-md min-h-[120px]">
      {initialDataLoading ? ( 
        <div className="flex items-center justify-center py-8">
          <SpinnerIcon className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-3 text-lg">Connecting to translation stream...</p>
        </div>
      ) : translationError ? (
        <div className="text-center py-4">
            <p className="text-destructive text-lg">Translation Error:</p>
            <p className="text-muted-foreground">{translationError}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="font-semibold text-xl mb-2">Translated Audio ({lang.toUpperCase()}):</h3>
           <p className="text-sm text-muted-foreground mt-1">
             {isTranslationCompleted ? "Translation Finished." : isPlayingTranslatedAudio ? "Playing..." : "Paused"}
           </p>
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
              <Button onClick={toggleTranslatedAudioPlayback} variant={isPlayingTranslatedAudio ? "default" : "outline"} size="icon" className="h-16 w-16 rounded-full" disabled={initialDataLoading}>
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
                playing={true}
                muted={isPlayingTranslatedAudio}
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
            <div className="flex items-center justify-center gap-4 mt-4">
                <Button onClick={toggleTranslatedAudioPlayback} variant={isPlayingTranslatedAudio ? "default" : "outline"} size="lg" disabled={initialDataLoading}>
                    {isPlayingTranslatedAudio ? <Volume2 className="mr-2 h-5 w-5" /> : <VolumeX className="mr-2 h-5 w-5" />}
                    {isPlayingTranslatedAudio ? "Mute" : "Listen"}
                </Button>
                <Button variant="outline" onClick={switchToAudioMode}><Headphones className="mr-2 h-5 w-5" />Audio Only</Button>
                <Button variant="outline" onClick={() => setIsFeedbackModalOpen(true)}><MessageCircleQuestion className="mr-2 h-5 w-5" />Feedback</Button>
                <Button variant="destructive" onClick={goBackToSubmit}><X className="mr-2 h-5 w-5" />Stop</Button>
            </div>
          </div>
          {feedbackModal}
        </div>
      </main>
    </div>
  );
}