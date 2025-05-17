"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"
import { SettingsButton } from "@/components/settings-button"
import { Loader2, Youtube, Volume2, Video } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SignedIn, SignedOut, UserButton, SignInButton, useAuth } from "@clerk/nextjs"
import { getSocket } from '../lib/socket'; // Adjust path if your lib folder is elsewhere
import { v4 as uuidv4 } from 'uuid';

// YouTube URL Validation Regex (includes common patterns including /live/)
const YOUTUBE_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function isValidYouTubeUrl(url: string): boolean {
  if (!url) return false;
  return YOUTUBE_URL_REGEX.test(url);
}

export default function SubmitPage() {
  const [url, setUrl] = useState("")
  const [urlError, setUrlError] = useState("") // Specific error for URL format
  const [submissionError, setSubmissionError] = useState("") // General error for submission process
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [language, setLanguage] = useState("es") // Default to Spanish
  const [format, setFormat] = useState("video-audio") // Default to Video+Audio
  const [currentStep, setCurrentStep] = useState(1)
  const router = useRouter()
  const { getToken } = useAuth();
  const [currentClientRequestId, setCurrentClientRequestId] = useState<string | null>(null);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    if (newUrl.trim() && !isValidYouTubeUrl(newUrl)) {
      setUrlError("Please enter a valid YouTube URL format (e.g., youtube.com/watch?v=... or youtu.be/... or youtube.com/live/...).");
    } else {
      setUrlError("");
    }
    setSubmissionError(""); // Clear general submission error when URL changes
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(""); // Clear previous submission errors

    if (!isValidYouTubeUrl(url)) {
      setUrlError("Please enter a valid YouTube URL format.");
      setSubmissionError("Cannot proceed: invalid YouTube URL."); // Also set general error for clarity
      return;
    }
    setUrlError(""); // Clear URL specific error if it was valid on submit

    setIsSubmitting(true);

    const socket = getSocket();

    if (!socket.connected) {
      socket.connect();
      console.warn("[SubmitPage] Socket was not connected, attempting connect and emit.");
    }

    const newClientRequestId = uuidv4();
    setCurrentClientRequestId(newClientRequestId);

    const payload = {
      youtubeUrl: url,
      targetLanguage: language,
      clientRequestId: newClientRequestId,
    };

    console.log('[SubmitPage] Emitting "initiate_youtube_translation":', payload);
    socket.emit('initiate_youtube_translation', payload);
  };

  useEffect(() => {
    if (!currentClientRequestId) {
      return;
    }

    const socket = getSocket();
    let PinnedClientRequestId = currentClientRequestId;

    console.log(`[SubmitPage Effect] Setting up listeners for clientRequestId: ${PinnedClientRequestId}`);

    const handleRequestProcessing = (data: { clientRequestId: string; streamId: string; message: string }) => {
      console.log('[SubmitPage Effect] Received request_processing:', data);
      if (data.clientRequestId === PinnedClientRequestId) {
        console.log(`[SubmitPage Effect] Matched clientRequestId. Redirecting to /live?streamId=${data.streamId}`);
        setIsSubmitting(false);
        router.push(`/live?streamId=${data.streamId}&lang=${language}&format=${format}`);
        setCurrentClientRequestId(null);
      }
    };

    const handleRequestError = (data: { clientRequestId?: string; message: string; streamId?: string }) => {
      console.log('[SubmitPage Effect] Received request_error/translation_error:', data);
      // Check if this error is for the request we are currently tracking
      // The check for data.streamId would require a map on the client if server only sends streamId with some errors.
      // Assuming server includes clientRequestId in error payloads for simplicity here.
      if (data.clientRequestId === PinnedClientRequestId) {
        console.error(`[SubmitPage Effect] Error for clientRequestId ${PinnedClientRequestId}:`, data.message);
        setSubmissionError(data.message || "An error occurred during submission.");
        setIsSubmitting(false);
        setCurrentClientRequestId(null);
      }
    };

    socket.on('request_processing', handleRequestProcessing);
    socket.on('request_error', handleRequestError);
    socket.on('translation_error', handleRequestError);

    return () => {
      console.log(`[SubmitPage Effect] Cleaning up listeners for clientRequestId: ${PinnedClientRequestId}`);
      socket.off('request_processing', handleRequestProcessing);
      socket.off('request_error', handleRequestError);
      socket.off('translation_error', handleRequestError);
    };
  }, [currentClientRequestId, router, language, format]);

  const nextStep = () => {
    setSubmissionError(""); // Clear general submission error on step change attempt
    if (currentStep === 1) {
      if (!url.trim()) {
        setUrlError("Please enter a YouTube URL.");
        return;
      }
      if (!isValidYouTubeUrl(url)) {
        setUrlError("Please enter a valid YouTube URL format to continue.");
        return;
      }
      setUrlError(""); // Clear URL error if valid
    }

    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setUrlError(""); // Clear URL error when going back
      setSubmissionError("");
    }
  }

  // For testing - direct link to live page
  const goToLivePageTest = () => {
    const testVideoId = "jfKfPfyJRdk" // Lo-fi beats video as a test
    window.location.href = `/live?v=${testVideoId}&lang=${language}&format=${format}`;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <SettingsButton />
          <LanguageToggle />
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton />
          </SignedOut>
        </div>
      </header>
      <main className="container flex-1 py-10">
        <div className="mx-auto w-full max-w-lg">
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold">Start Listening</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Step 1: Enter Livestream Link */}
                <div className={`space-y-4 ${currentStep !== 1 ? "hidden" : ""}`}>
                  <div className="text-center mb-6">
                    <h2 className="text-xl font-semibold">1. Enter the Livestream Link</h2>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url" className="text-base">
                      URL Link
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Youtube className="h-5 w-5" />
                      </div>
                      <Input
                        id="url"
                        className="pl-10"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={url}
                        onChange={handleUrlChange}
                        required
                      />
                    </div>
                    {urlError && <p className="text-sm text-destructive">{urlError}</p>}
                    {submissionError && !urlError && <p className="text-sm text-destructive">{submissionError}</p>}
                  </div>
                  <div className="pt-4">
                    <Button type="button" onClick={nextStep} className="w-full h-11 text-base">
                      Continue
                    </Button>
                  </div>
                </div>

                {/* Step 2: Select Language */}
                <div className={`space-y-4 ${currentStep !== 2 ? "hidden" : ""}`}>
                  <div className="text-center mb-6">
                    <h2 className="text-xl font-semibold">2. Select the Language</h2>
                  </div>
                  <RadioGroup defaultValue={language} onValueChange={setLanguage} className="grid grid-cols-1 gap-4">
                    <Label
                      htmlFor="spanish"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <RadioGroupItem value="es" id="spanish" className="sr-only" />
                      <div className="text-center space-y-2">
                        <h3 className="font-medium">Spanish</h3>
                      </div>
                    </Label>
                    {/* More languages can be added here in the future */}
                  </RadioGroup>
                  <div className="pt-4 flex gap-3">
                    <Button type="button" onClick={prevStep} variant="outline" className="w-1/2 h-11 text-base">
                      Back
                    </Button>
                    <Button type="button" onClick={nextStep} className="w-1/2 h-11 text-base">
                      Continue
                    </Button>
                  </div>
                </div>

                {/* Step 3: Translation Format */}
                <div className={`space-y-4 ${currentStep !== 3 ? "hidden" : ""}`}>
                  <div className="text-center mb-6">
                    <h2 className="text-xl font-semibold">3. Translation Format</h2>
                  </div>
                  <RadioGroup defaultValue={format} onValueChange={setFormat} className="grid grid-cols-1 gap-4">
                    <Label
                      htmlFor="video-audio"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <RadioGroupItem value="video-audio" id="video-audio" className="sr-only" />
                      <Video className="mb-3 h-6 w-6" />
                      <div className="text-center space-y-2">
                        <h3 className="font-medium">Video + Spanish Audio</h3>
                        <p className="text-sm text-muted-foreground">Watch the video with Spanish translation</p>
                      </div>
                    </Label>

                    <Label
                      htmlFor="audio-only"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <RadioGroupItem value="audio-only" id="audio-only" className="sr-only" />
                      <Volume2 className="mb-3 h-6 w-6" />
                      <div className="text-center space-y-2">
                        <h3 className="font-medium">Audio Only</h3>
                        <p className="text-sm text-muted-foreground">Listen to Spanish translation without video</p>
                      </div>
                    </Label>
                  </RadioGroup>
                  <div className="pt-4 flex gap-3">
                    <Button type="button" onClick={prevStep} variant="outline" className="w-1/2 h-11 text-base">
                      Back
                    </Button>
                    <Button type="submit" className="w-1/2 h-11 text-base" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        "Start Translation"
                      )}
                    </Button>
                  </div>
                </div>
              </form>

              {/* Temporary test button for direct access to live page */}
              <div className="mt-8 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Having trouble with the form? Try this test link:</p>
                <Button type="button" variant="outline" onClick={goToLivePageTest} className="w-full">
                  Go to Test Live Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
