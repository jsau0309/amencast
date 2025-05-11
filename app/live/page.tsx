"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"
import { SettingsButton } from "@/components/settings-button"
import { Volume2, VolumeX, Video, X, Headphones, MessageCircleQuestion, Loader2 as SpinnerIcon } from "lucide-react"
import { SignedIn, SignedOut, UserButton, SignInButton, useAuth } from "@clerk/nextjs"
import ReactPlayer from 'react-player/youtube'
import { Room, RoomEvent, RemoteTrackPublication, RemoteParticipant, ConnectionState, Track } from "livekit-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

// Define a type for the stream details we expect from the API
interface StreamDetails {
  id: string;
  youtube_video_id: string;
  status: string;
  listener_id: string;
  started_at: string;
  ended_at?: string | null;
}

const FEEDBACK_OPTIONS = [
  { value: "AUDIO_LAG", label: "Audio Lag / Sync Issues" },
  { value: "WRONG_VERSE", label: "Incorrect Bible Verse" },
  { value: "TRANSLATION_QUALITY", label: "Poor Translation Quality" },
  { value: "TECHNICAL_ISSUE", label: "Other Technical Issue" },
  { value: "OTHER", label: "Other Feedback" },
];

export default function LivestreamPage() {
  const searchParams = useSearchParams()
  const streamId = searchParams.get("streamId")
  const livekitTokenFromUrl = searchParams.get("token")
  const lang = searchParams.get("lang") || "es"
  const initialFormat = searchParams.get("format") || "video-audio"

  const [streamDetails, setStreamDetails] = useState<StreamDetails | null>(null)
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [currentFormat, setCurrentFormat] = useState(initialFormat)
  const [isTranslating, setIsTranslating] = useState(false)
  const [showCaptions, setShowCaptions] = useState(false)
  const [caption, setCaption] = useState("")
  
  const [livekitRoom, setLivekitRoom] = useState<Room | null>(null)
  const [isLiveKitConnecting, setIsLiveKitConnecting] = useState(false)
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(false)
  const [liveKitError, setLiveKitError] = useState<string | null>(null)
  
  // Feedback Modal State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
  const [feedbackCode, setFeedbackCode] = useState<string>("")
  const [feedbackNote, setFeedbackNote] = useState("")
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null)
  
  const audioPlayerRef = useRef<HTMLAudioElement>(null)
  const { getToken, userId: clerkUserId } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!streamId) {
      setError("Stream ID is missing from URL.")
      setIsLoading(false)
      return
    }
    if (!livekitTokenFromUrl) {
      setError("LiveKit token is missing from URL.")
      setIsLoading(false)
      return
    }

    const fetchStreamDetails = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const clerkToken = await getToken()
        if (!clerkToken) {
          setError("Not authenticated to fetch stream details.")
          setIsLoading(false)
          return
        }

        const response = await fetch(`/api/streams/${streamId}`, {
          headers: {
            Authorization: `Bearer ${clerkToken}`,
          },
        })

        if (!response.ok) {
          if (response.status === 404) {
            setError("Stream not found or you don't have access.")
          } else {
            const errData = await response.json().catch(() => ({}))
            setError(errData.error || "Failed to fetch stream details.")
          }
          setIsLoading(false)
          return
        }
        const data: StreamDetails = await response.json()
        setStreamDetails(data)
        if (data.youtube_video_id) {
          setYoutubeVideoId(`https://www.youtube.com/watch?v=${data.youtube_video_id}`)
        } else {
          setError("YouTube video ID not found in stream details.")
        }
      } catch (e: any) {
        console.error("Error fetching stream details:", e)
        setError(e.message || "An error occurred while fetching stream details.")
      }
      setIsLoading(false)
    }

    fetchStreamDetails()
  }, [streamId, livekitTokenFromUrl, getToken])

  useEffect(() => {
    const livekitHost = process.env.NEXT_PUBLIC_LIVEKIT_HOST

    if (!livekitTokenFromUrl || !streamId || !livekitHost) {
      if (!isLoading && !error) {
        setLiveKitError("LiveKit configuration or token/streamId missing.")
      }
      if (livekitRoom) livekitRoom.disconnect()
      setLivekitRoom(null)
      setIsLiveKitConnected(false)
      setIsLiveKitConnecting(false)
      return
    }

    if (livekitRoom?.state === ConnectionState.Connected || livekitRoom?.state === ConnectionState.Connecting) {
      return
    }

    const room = new Room()
    setLivekitRoom(room)
    setIsLiveKitConnecting(true)
    setLiveKitError(null)
    console.log(`Attempting to connect to LiveKit room: ${streamId}`)

    room
      .on(RoomEvent.TrackSubscribed, (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log("LiveKit Track Subscribed:", track.kind, track.sid, participant.identity)
        if (track.kind === Track.Kind.Audio && audioPlayerRef.current) {
          track.attach(audioPlayerRef.current)
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        console.log("LiveKit Track Unsubscribed:", track.kind, track.sid)
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach(element => element.remove())
        }
      })
      .on(RoomEvent.Disconnected, (reason?: any) => {
        console.log("LiveKit Disconnected. Reason:", reason)
        setIsLiveKitConnected(false)
        setIsLiveKitConnecting(false)
        setIsTranslating(false)
        let disconnectMsg = "Disconnected from LiveKit."
        if (reason && typeof reason === 'string') disconnectMsg += ` Reason: ${reason}`
        else if (reason && reason.message) disconnectMsg += ` Reason: ${reason.message}`
        setLiveKitError(disconnectMsg)
      })
      .on(RoomEvent.ConnectionStateChanged, (connectionState: ConnectionState) => {
        console.log("LiveKit Connection State Changed:", connectionState)
        if (connectionState === ConnectionState.Connected) {
          setIsLiveKitConnected(true)
          setIsLiveKitConnecting(false)
          setLiveKitError(null)
          setIsTranslating(true)
        } else if (connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting) {
          setIsLiveKitConnecting(true)
          setIsLiveKitConnected(false)
        } else {
          setIsLiveKitConnected(false)
          setIsLiveKitConnecting(false)
        }
      })

    const connectToRoom = async () => {
      try {
        await room.connect(livekitHost, livekitTokenFromUrl)
        console.log(`Successfully connected to LiveKit room: ${streamId}`)
      } catch (connectError: any) {
        console.error("Error connecting to LiveKit room:", connectError)
        setLiveKitError(connectError.message || "Failed to connect to LiveKit. Check token/URL.")
        setIsLiveKitConnected(false)
        setIsLiveKitConnecting(false)
        if (livekitRoom !== room) room.disconnect()
      }
    }

    connectToRoom()

    return () => {
      console.log("LiveKit useEffect cleanup: disconnecting room", room.name)
      room.disconnect()
      setLivekitRoom(null)
      setIsLiveKitConnected(false)
      setIsLiveKitConnecting(false)
    }
  }, [livekitTokenFromUrl, streamId])

  useEffect(() => {
    if (audioPlayerRef.current && livekitRoom?.state === ConnectionState.Connected) {
      const audioElement = audioPlayerRef.current
      let playedOnce = false

      livekitRoom.remoteParticipants.forEach(participant => {
        participant.getTrackPublications().forEach(publication => {
          if (publication.track?.kind === Track.Kind.Audio && publication.isSubscribed) {
            if (isTranslating && audioElement.paused) {
              audioElement.play().then(() => playedOnce = true).catch(e => console.error("Error auto-playing LiveKit audio:", e))
            } else if (!isTranslating && !audioElement.paused) {
              audioElement.pause()
            }
          }
        })
      })

      if (isTranslating && audioElement.paused && !playedOnce && livekitRoom.remoteParticipants.size > 0) {
        // This might be too aggressive, but attempts to play if something is there and should be playing
        // A better way is to react to the track object itself being attached and ready
      }
    }
  }, [isTranslating, livekitRoom, isLiveKitConnected])

  const handleFeedbackSubmit = async () => {
    if (!feedbackCode || !streamId) {
      setFeedbackSubmitError("Please select a reason for your feedback.")
      return
    }
    setIsSubmittingFeedback(true)
    setFeedbackSubmitError(null)
    try {
      const clerkToken = await getToken()
      if (!clerkToken) {
        setFeedbackSubmitError("Authentication required to submit feedback.")
        setIsSubmittingFeedback(false)
        return
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${clerkToken}`,
        },
        body: JSON.stringify({
          streamId: streamId,
          code: feedbackCode,
          note: feedbackNote,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "An unknown error occurred." }))
        setFeedbackSubmitError(errorData.error || `Failed to submit feedback: ${response.statusText}`)
      } else {
        toast.success("Feedback submitted! Thank you.")
        setIsFeedbackModalOpen(false)
        setFeedbackCode("")
        setFeedbackNote("")
      }
    } catch (err: any) {
      console.error("Error submitting feedback:", err)
      setFeedbackSubmitError(err.message || "An unexpected error occurred.")
    }
    setIsSubmittingFeedback(false)
  }

  const toggleTranslation = () => setIsTranslating(prev => !prev)
  const switchToAudioMode = () => setCurrentFormat("audio-only")
  const switchToVideoMode = () => setCurrentFormat("video-audio")
  const goBackToSubmit = () => router.push("/submit")

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SpinnerIcon className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading stream data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Error Loading Stream Data</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={goBackToSubmit}>
            Go Back
          </Button>
        </div>
      </div>
    )
  }
  
  if (!streamDetails || !youtubeVideoId || !livekitTokenFromUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Stream Data Incomplete</h1>
          <p className="mt-2 text-muted-foreground">Could not load all necessary stream information. Please try again.</p>
          <Button className="mt-4" onClick={goBackToSubmit}>
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  const liveKitStatusUI = (
    <div className="text-center my-2">
      {isLiveKitConnecting && <p className="text-blue-500">Connecting to translation service...</p>}
      {isLiveKitConnected && <p className="text-green-500">Translation service connected.</p>}
      {liveKitError && <p className="text-yellow-600">LiveKit Service: {liveKitError}</p>}
    </div>
  )

  const feedbackModal = (
    <Dialog open={isFeedbackModalOpen} onOpenChange={setIsFeedbackModalOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Let us know what went wrong. Your feedback helps us improve.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="feedbackCode" className="text-right">
              Reason
            </Label>
            <RadioGroup
              id="feedbackCode"
              value={feedbackCode}
              onValueChange={setFeedbackCode}
              className="col-span-3"
            >
              {FEEDBACK_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={`rb-${option.value}`} />
                  <Label htmlFor={`rb-${option.value}`}>{option.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="feedbackNote" className="text-right">
              Details
            </Label>
            <Textarea
              id="feedbackNote"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              placeholder="Optional: provide more details..."
              className="col-span-3"
            />
          </div>
          {feedbackSubmitError && (
            <p className="col-span-4 text-sm text-destructive text-center">{feedbackSubmitError}</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleFeedbackSubmit} disabled={isSubmittingFeedback || !feedbackCode}>
            {isSubmittingFeedback && <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />}Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (currentFormat === "audio-only") {
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
        <main className="container flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-md flex flex-col items-center">
            <div className="relative w-64 h-64 mb-8">
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-50/40 to-orange-500/40 animate-pulse-slow"></div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-50 to-orange-500 shadow-lg animate-pulse-subtle flex items-center justify-center">
                <audio ref={audioPlayerRef} className="hidden" />
                <div className="w-1/2 h-1/2 rounded-full bg-gradient-to-b from-orange-300/80 to-amber-50/80 animate-pulse-fast"></div>
              </div>
            </div>
            {liveKitStatusUI}
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold">Listening in Spanish</h2>
              <p className="text-muted-foreground mt-2">
                {isTranslating && isLiveKitConnected ? "Audio translation is active" : "Audio translation is inactive"}
              </p>
            </div>
            <div className="flex items-center justify-center gap-8 mt-auto">
              <Button onClick={toggleTranslation} variant={isTranslating ? "default" : "outline"} size="icon" className="h-16 w-16 rounded-full" disabled={!isLiveKitConnected}>
                {isTranslating ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={switchToVideoMode}>
                <Video className="h-6 w-6" />
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={() => setIsFeedbackModalOpen(true)}>
                <MessageCircleQuestion className="h-6 w-6" />
                <span className="sr-only">Report Issue</span>
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={goBackToSubmit}>
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>
          {feedbackModal}
        </main>
      </div>
    )
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
      <main className="container flex-1 py-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {currentFormat === "video-audio" && youtubeVideoId && (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <ReactPlayer
                url={youtubeVideoId}
                playing={true}
                muted={true}
                controls={true}
                width="100%"
                height="100%"
                onError={(e) => console.error('ReactPlayer error:', e)}
                onReady={() => console.log('ReactPlayer ready')}
              />
            </div>
          )}
          <audio ref={audioPlayerRef} className="hidden" />
          {liveKitStatusUI}
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <p className="text-muted-foreground">
                {isTranslating && isLiveKitConnected ? "Audio translation is active" : "Audio translation is inactive"}
              </p>
            </div>
            <div className="flex items-center justify-center gap-8 mt-4">
              <Button onClick={toggleTranslation} variant={isTranslating ? "default" : "outline"} size="icon" className="h-16 w-16 rounded-full" disabled={!isLiveKitConnected}>
                {isTranslating ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={switchToAudioMode}>
                <Headphones className="h-6 w-6" />
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={() => setIsFeedbackModalOpen(true)}>
                <MessageCircleQuestion className="h-6 w-6" />
                <span className="sr-only">Report Issue</span>
              </Button>
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={goBackToSubmit}>
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>
          {feedbackModal}
        </div>
      </main>
    </div>
  )
}
