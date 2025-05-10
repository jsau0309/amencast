"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export function Globe({
  className,
}: {
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let globe: any = null
    const animationFrame: number | null = null

    const initGlobe = async () => {
      try {
        setIsLoading(true)

        // Dynamically import cobe to avoid SSR issues
        const createGlobe = (await import("cobe")).default

        if (!canvasRef.current) return

        const phi = 0
        let width = canvasRef.current.offsetWidth

        const onResize = () => {
          if (canvasRef.current) {
            width = canvasRef.current.offsetWidth
          }
        }

        window.addEventListener("resize", onResize)

        // Simple rotation animation
        let rotation = 0

        globe = createGlobe(canvasRef.current, {
          devicePixelRatio: 2,
          width: width * 2,
          height: width * 2,
          phi: 0,
          theta: 0.3,
          dark: 1,
          diffuse: 0.6,
          mapSamples: 20000,
          mapBrightness: 8,
          baseColor: [0.1, 0.1, 0.1],
          markerColor: [251 / 255, 100 / 255, 21 / 255],
          glowColor: [1, 1, 1],
          markers: [
            { location: [14.5995, 120.9842], size: 0.01 },
            { location: [19.076, 72.8777], size: 0.03 },
            { location: [23.8103, 90.4125], size: 0.015 },
            { location: [30.0444, 31.2357], size: 0.02 },
            { location: [39.9042, 116.4074], size: 0.025 },
            { location: [-23.5505, -46.6333], size: 0.03 },
            { location: [19.4326, -99.1332], size: 0.03 },
            { location: [40.7128, -74.006], size: 0.03 },
            { location: [34.6937, 135.5022], size: 0.015 },
            { location: [41.0082, 28.9784], size: 0.02 },
          ],
          onRender: (state: any) => {
            // Simple continuous rotation
            rotation += 0.00525
            state.phi = rotation
            state.width = width * 2
            state.height = width * 2
          },
        })

        // Fade in the globe
        if (canvasRef.current) {
          canvasRef.current.style.opacity = "1"
        }

        setIsLoading(false)
      } catch (err) {
        console.error("Failed to initialize globe:", err)
        setError("Failed to load interactive globe")
        setIsLoading(false)
      }
    }

    initGlobe()

    return () => {
      if (globe) {
        globe.destroy()
      }
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
      window.removeEventListener("resize", () => {})
    }
  }, [])

  if (error) {
    return (
      <div
        className={cn(
          "absolute inset-0 mx-auto aspect-[1/1] w-full max-w-[704px] flex items-center justify-center",
          className,
        )}
      >
        <div className="w-[528px] h-[528px] rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <p className="text-muted-foreground text-center">
            Global translation
            <br />
            coming soon
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("absolute inset-0 mx-auto aspect-[1/1] w-full max-w-[704px]", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[528px] h-[528px] rounded-full bg-gray-100 animate-pulse" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="size-full opacity-0 transition-opacity duration-500 [contain:layout_paint_size]"
      />
    </div>
  )
}
