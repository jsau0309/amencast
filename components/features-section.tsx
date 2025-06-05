"use client"
import { Headphones, Book, Globe, Clock3, Heart, LinkIcon, User } from "lucide-react"
import { useState, useEffect } from 'react';

export function FeaturesSection() {
  return (
    <section className="px-4 pt-8 pb-12 md:pt-16 md:pb-24 lg:pt-22 lg:pb-32">
      <div className="mx-auto grid max-w-5xl border md:grid-cols-2">
        {/* Real-time Translation */}
        <div>
          <div className="p-4 sm:p-6 lg:p-12">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Headphones className="size-4" />
              Real-time Translation
            </span>

            <p className="mt-4 sm:mt-6 lg:mt-8 text-xl sm:text-2xl font-semibold leading-tight">
              Instant translation powered by AI, designed for live or recorded sermons.
            </p>
          </div>

          <div aria-hidden className="relative px-4 sm:px-0">
            <div className="absolute inset-0 z-10 m-auto size-fit">
              <div className="rounded-[--radius] bg-background z-[1] dark:bg-muted relative flex size-fit w-fit items-center gap-2 border px-2 sm:px-3 py-1 text-xs font-medium shadow-md shadow-black/5">
                <span className="text-base sm:text-lg">🎙️</span>
                <span className="hidden sm:inline">Live translation active</span>
                <span className="sm:hidden">Live active</span>
              </div>
              <div className="rounded-[--radius] bg-background absolute inset-2 -bottom-2 mx-auto border px-2 sm:px-3 py-2 sm:py-4 text-xs font-medium shadow-md shadow-black/5 dark:bg-zinc-900"></div>
            </div>

            <div className="relative overflow-hidden h-32 sm:h-40 lg:h-48">
              <div className="[background-image:radial-gradient(var(--tw-gradient-stops))] z-1 to-background absolute inset-0 from-transparent to-75%"></div>
              <AudioWaveform />
            </div>
          </div>
        </div>

        {/* Verse Lookup Engine */}
        <div className="overflow-hidden border-t bg-zinc-50 p-4 sm:p-6 lg:p-12 md:border-0 md:border-l dark:bg-transparent">
          <div className="relative z-10">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Book className="size-4" />
              Verse Lookup Engine
            </span>

            <p className="my-4 sm:my-6 lg:my-8 text-xl sm:text-2xl font-semibold leading-tight">
              Accurate biblical context powered by verse look up engine. Any version, Any language.
            </p>
          </div>
          <div aria-hidden className="flex flex-col gap-4 sm:gap-6 lg:gap-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex justify-center items-center size-4 sm:size-5 rounded-full border">
                  <span className="size-2 sm:size-3 rounded-full bg-black" />
                </span>
                <span className="text-muted-foreground text-xs">Juan 3:16</span>
              </div>
              <div className="rounded-[--radius] bg-background mt-1.5 w-full sm:w-4/5 border p-2 sm:p-3 text-xs">
                "For God so loved the world..."
              </div>
            </div>

            <div>
              <div className="rounded-[--radius] mb-1 ml-auto w-full sm:w-4/5 bg-black p-2 sm:p-3 text-xs text-white">
                "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito..."
              </div>
              <span className="text-muted-foreground block text-right text-xs">Translated</span>
            </div>
          </div>
        </div>

        {/* <3s Delay Metric */}
        <div className="col-span-full border-y p-6 sm:p-8 lg:p-12">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
              <Clock3 className="size-5 sm:size-6 text-black" />
              <span className="text-muted-foreground text-xs sm:text-sm">Performance that matters</span>
            </div>
            <p className="text-3xl sm:text-4xl lg:text-7xl font-semibold text-black">&lt;3s Delay</p>
            <p className="mt-3 sm:mt-4 text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
              Hear every word as it's spoken, not minutes later. Our cutting-edge AI pipeline delivers translations with
              less than 3 seconds of delay.
            </p>
          </div>
        </div>

        {/* Direct Platform Connection */}
        <div>
          <div className="p-4 sm:p-6 lg:p-12">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Globe className="size-4" />
              Direct Platform Connection
            </span>

            <p className="mt-4 sm:mt-6 lg:mt-8 text-xl sm:text-2xl font-semibold leading-tight">
              Works with any Livestream Source instantly.
            </p>
          </div>

          <div
            aria-hidden
            className="relative h-32 sm:h-40 lg:h-48 flex items-center justify-center px-4 sm:px-8 lg:px-12"
          >
            <div className="flex items-center justify-between w-full">
              {/* Globe box */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
                <Globe className="h-6 w-6 sm:h-8 sm:w-8 lg:h-10 lg:w-10 text-gray-500" />
              </div>

              {/* Connection line with animated signal */}
              <div className="relative flex-1 mx-2 sm:mx-4">
                {/* Base connection line */}
                <div className="h-[2px] bg-gray-300 w-full"></div>

                {/* Animated signal dot */}
                <div className="absolute top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-black rounded-full animate-signal"></div>

                {/* Connection label - now visible on mobile with simplified text */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-full px-2 sm:px-3 py-1 shadow-md flex items-center gap-1 sm:gap-1.5 z-10">
                  <LinkIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="text-xs">Connected</span>
                </div>
              </div>

              {/* AmenCast box */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gray-200 rounded-full shadow-md flex items-center justify-center">
                <User className="h-6 w-6 sm:h-8 sm:w-8 lg:h-10 lg:w-10 text-gray-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Global Church Unity */}
        <div className="overflow-hidden border-t bg-zinc-50 p-4 sm:p-6 lg:p-12 md:border-0 md:border-l dark:bg-transparent">
          <div className="relative z-10">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Heart className="size-4" />
              Global Church Unity
            </span>

            <p className="my-4 sm:my-6 lg:my-8 text-xl sm:text-2xl font-semibold leading-tight">
              Every message deserves to be understood, not just translated.
            </p>
          </div>
          <div aria-hidden className="flex flex-col gap-4 sm:gap-6 lg:gap-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex justify-center items-center size-4 sm:size-5 rounded-full border">
                  <span className="size-2 sm:size-3 rounded-full bg-black" />
                </span>
                <span className="text-muted-foreground text-xs">18M+ Spanish Speakers</span>
              </div>
              <div className="rounded-[--radius] bg-background mt-1.5 w-full sm:w-4/5 border p-2 sm:p-3 text-xs">
                Now have access to English church services
              </div>
            </div>

            <div>
              <div className="rounded-[--radius] mb-1 ml-auto w-full sm:w-4/5 bg-black p-2 sm:p-3 text-xs text-white">
                Every voice deserves to belong in worship, regardless of language.
              </div>
              <span className="text-muted-foreground block text-right text-xs">Our Mission</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Audio Waveform Visualization
const AudioWaveform = () => {
  const viewBox = `0 0 120 60`
  const initialBars = Array.from({ length: 40 }, (_, i) => {
    const h = Math.sin(i * 0.5) * 20 + 25;
    const yPos = 30 - h / 2;
    return {
      id: i,
      x: i * 3,
      y: yPos.toFixed(5),
      height: h.toFixed(5),
      opacity: "0.5",
    };
  })

  const [bars, setBars] = useState(initialBars)

  useEffect(() => {
    setBars(currentBars =>
      currentBars.map(bar => {
        const h = Math.sin(bar.id * 0.5) * 20 + 25;
        const yPos = 30 - h / 2;
        return {
          ...bar,
          y: yPos.toFixed(5),
          height: h.toFixed(5),
          opacity: (Math.random() * 0.7 + 0.3).toFixed(5),
        };
      })
    )
  }, [])

  return (
    <svg viewBox={viewBox} className="w-full h-full">
      {bars.map((bar) => (
        <rect
          key={bar.id}
          x={bar.x.toString()}
          y={bar.y}
          width="2"
          height={bar.height}
          fill="currentColor"
          opacity={bar.opacity}
          className="animate-pulse"
        />
      ))}
    </svg>
  )
}
