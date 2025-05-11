"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"
import { SettingsButton } from "@/components/settings-button"
import { Volume2, VolumeX, Video, X, Headphones } from "lucide-react"
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs"

export default function LivestreamPage() {
  const searchParams = useSearchParams()
  const videoId = searchParams.get("v")
  const format = searchParams.get("format") || "video-audio"
  const [isTranslating, setIsTranslating] = useState(false)
  const [showCaptions, setShowCaptions] = useState(false)
  const [caption, setCaption] = useState("")
  const playerRef = useRef<HTMLDivElement>(null)
  const audioPlayerRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (format === "audio-only") {
      // For audio-only mode, we'll handle audio separately
      // Auto-start translation in audio-only mode
      setIsTranslating(true)

      // Simulate caption fallback after 5 seconds
      const captionTimer = setTimeout(() => {
        setShowCaptions(true)
        setCaption("Dios es bueno todo el tiempo, y todo el tiempo Dios es bueno.")
      }, 5000)

      return () => clearTimeout(captionTimer)
    }

    // Load YouTube IFrame API for video mode
    const tag = document.createElement("script")
    tag.src = "https://www.youtube.com/iframe_api"
    const firstScriptTag = document.getElementsByTagName("script")[0]
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

    // Initialize player when API is ready
    window.onYouTubeIframeAPIReady = () => {
      if (!playerRef.current || !videoId) return

      new window.YT.Player(playerRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            console.log("Player ready")
          },
          onStateChange: (event) => {
            console.log("Player state changed", event.data)
          },
          onError: (event) => {
            console.error("Player error", event.data)
          },
        },
      })
    }

    return () => {
      // Clean up
      window.onYouTubeIframeAPIReady = null
    }
  }, [videoId, format])

  const toggleTranslation = () => {
    setIsTranslating(!isTranslating)

    if (!isTranslating) {
      // Simulate caption fallback after 5 seconds
      setTimeout(() => {
        setShowCaptions(true)
        setCaption("Dios es bueno todo el tiempo, y todo el tiempo Dios es bueno.")
      }, 5000)
    } else {
      setShowCaptions(false)
      setCaption("")
    }
  }

  const switchToAudioMode = () => {
    // Redirect to the same page but with audio-only format
    window.location.href = `/live?v=${videoId}&format=audio-only`
  }

  const switchToVideoMode = () => {
    // Redirect to the same page but with video-audio format
    window.location.href = `/live?v=${videoId}&format=video-audio`
  }

  if (!videoId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Invalid Video ID</h1>
          <p className="mt-2 text-muted-foreground">Please provide a valid YouTube video ID</p>
          <Button className="mt-4" onClick={() => (window.location.href = "/submit")}>
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  // Audio-only mode
  if (format === "audio-only") {
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
            {/* Audio visualization with orange gradient and pulsing animation */}
            <div className="relative w-64 h-64 mb-8">
              {/* Outer pulsing circle */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-50/40 to-orange-500/40 animate-pulse-slow"></div>

              {/* Main circle */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-50 to-orange-500 shadow-lg animate-pulse-subtle flex items-center justify-center">
                {/* Audio element (hidden but functional) */}
                <audio
                  ref={audioPlayerRef}
                  src={`https://example.com/audio-stream?v=${videoId}`} // Replace with actual audio stream URL
                  className="hidden"
                  autoPlay
                  controls
                />

                {/* Inner pulsing circle */}
                <div className="w-1/2 h-1/2 rounded-full bg-gradient-to-b from-orange-300/80 to-amber-50/80 animate-pulse-fast"></div>
              </div>
            </div>

            {/* Status text */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold">Listening in Spanish</h2>
              <p className="text-muted-foreground mt-2">
                {isTranslating ? "Audio translation is active" : "Audio translation is inactive"}
              </p>
            </div>

            {/* Caption area */}
            {showCaptions && (
              <div className="w-full rounded-lg bg-muted p-4 text-center mb-8">
                <p>{caption}</p>
              </div>
            )}

            {/* Control buttons - added translation toggle button */}
            <div className="flex items-center justify-center gap-8 mt-auto">
              {/* Toggle translation button */}
              <Button
                onClick={toggleTranslation}
                variant={isTranslating ? "default" : "outline"}
                size="icon"
                className="h-16 w-16 rounded-full"
              >
                {isTranslating ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                <span className="sr-only">{isTranslating ? "Disable Spanish" : "Enable Spanish"}</span>
              </Button>

              {/* Switch to video mode */}
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={switchToVideoMode}>
                <Video className="h-6 w-6" />
                <span className="sr-only">Switch to video</span>
              </Button>

              {/* Close button */}
              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full"
                onClick={() => (window.location.href = "/submit")}
              >
                <X className="h-6 w-6" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Video mode (default)
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
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <div ref={playerRef} className="h-full w-full" />
          </div>

          <div className="flex flex-col items-center gap-4">
            {/* Translation status - updated to match audio-only mode */}
            <div className="text-center">
              <p className="text-muted-foreground">
                {isTranslating ? "Audio translation is active" : "Audio translation is inactive"}
              </p>
            </div>

            {/* Caption area */}
            {showCaptions && (
              <div className="w-full rounded-lg bg-muted p-4 text-center">
                <p>{caption}</p>
              </div>
            )}

            {/* Control buttons - consistent with audio-only mode */}
            <div className="flex items-center justify-center gap-8 mt-4">
              {/* Toggle translation button */}
              <Button
                onClick={toggleTranslation}
                variant={isTranslating ? "default" : "outline"}
                size="icon"
                className="h-16 w-16 rounded-full"
              >
                {isTranslating ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                <span className="sr-only">{isTranslating ? "Disable Spanish" : "Enable Spanish"}</span>
              </Button>

              {/* Switch to audio-only mode */}
              <Button variant="outline" size="icon" className="h-16 w-16 rounded-full" onClick={switchToAudioMode}>
                <Headphones className="h-6 w-6" />
                <span className="sr-only">Switch to audio only</span>
              </Button>

              {/* Close button */}
              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full"
                onClick={() => (window.location.href = "/submit")}
              >
                <X className="h-6 w-6" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
