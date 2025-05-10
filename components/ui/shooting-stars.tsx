"use client"

import { cn } from "@/lib/utils"
import type React from "react"
import { useEffect, useState, useRef } from "react"

interface ShootingStar {
  id: number
  x: number
  y: number
  angle: number
  scale: number
  speed: number
  distance: number
  width: number
  height: number
  gradientId: string
}

interface ShootingStarsProps {
  minSpeed?: number
  maxSpeed?: number
  minDelay?: number
  maxDelay?: number
  starColor?: string
  trailColor?: string
  minStarWidth?: number
  maxStarWidth?: number
  minStarHeight?: number
  maxStarHeight?: number
  maxStars?: number
  className?: string
}

const getRandomStartPoint = () => {
  const side = Math.floor(Math.random() * 4)
  const offset = Math.random() * window.innerWidth

  switch (side) {
    case 0:
      return { x: offset, y: 0, angle: 45 }
    case 1:
      return { x: window.innerWidth, y: offset, angle: 135 }
    case 2:
      return { x: offset, y: window.innerHeight, angle: 225 }
    case 3:
      return { x: 0, y: offset, angle: 315 }
    default:
      return { x: 0, y: 0, angle: 45 }
  }
}

export const ShootingStars: React.FC<ShootingStarsProps> = ({
  minSpeed = 10,
  maxSpeed = 30,
  minDelay = 1200,
  maxDelay = 4200,
  starColor = "#9E00FF",
  trailColor = "#2EB9DF",
  minStarWidth = 8,
  maxStarWidth = 12,
  minStarHeight = 1,
  maxStarHeight = 2,
  maxStars = 5,
  className,
}) => {
  const [stars, setStars] = useState<ShootingStar[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const createStar = () => {
      const { x, y, angle } = getRandomStartPoint()
      const gradientId = `gradient-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      const newStar: ShootingStar = {
        id: Date.now() + Math.random(),
        x,
        y,
        angle,
        scale: 1,
        speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
        distance: 0,
        width: Math.random() * (maxStarWidth - minStarWidth) + minStarWidth,
        height: Math.random() * (maxStarHeight - minStarHeight) + minStarHeight,
        gradientId,
      }

      setStars((prevStars) => {
        // If we've reached the maximum number of stars, don't add more
        if (prevStars.length >= maxStars) {
          return prevStars
        }
        return [...prevStars, newStar]
      })

      // Schedule the next star creation
      const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
      timeoutRef.current = setTimeout(createStar, randomDelay)
    }

    // Start creating stars
    createStar()

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [minSpeed, maxSpeed, minDelay, maxDelay, minStarWidth, maxStarWidth, minStarHeight, maxStarHeight, maxStars])

  useEffect(() => {
    const moveStars = () => {
      setStars((prevStars) => {
        return prevStars
          .map((star) => {
            const newX = star.x + star.speed * Math.cos((star.angle * Math.PI) / 180)
            const newY = star.y + star.speed * Math.sin((star.angle * Math.PI) / 180)
            const newDistance = star.distance + star.speed
            const newScale = 1 + newDistance / 100

            // If the star is off-screen, remove it
            if (newX < -20 || newX > window.innerWidth + 20 || newY < -20 || newY > window.innerHeight + 20) {
              return null
            }

            return {
              ...star,
              x: newX,
              y: newY,
              distance: newDistance,
              scale: newScale,
            }
          })
          .filter(Boolean) as ShootingStar[]
      })

      requestAnimationFrame(moveStars)
    }

    const animationFrame = requestAnimationFrame(moveStars)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  return (
    <svg ref={svgRef} className={cn("w-full h-full absolute inset-0", className)}>
      <defs>
        {stars.map((star) => (
          <linearGradient key={star.gradientId} id={star.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: trailColor, stopOpacity: 0 }} />
            <stop offset="100%" style={{ stopColor: starColor, stopOpacity: 1 }} />
          </linearGradient>
        ))}
      </defs>

      {stars.map((star) => (
        <rect
          key={star.id}
          x={star.x}
          y={star.y}
          width={star.width * star.scale}
          height={star.height}
          fill={`url(#${star.gradientId})`}
          transform={`rotate(${star.angle}, ${star.x + (star.width * star.scale) / 2}, ${star.y + star.height / 2})`}
        />
      ))}
    </svg>
  )
}
