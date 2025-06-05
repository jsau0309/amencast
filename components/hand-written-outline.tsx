"use client"

import { motion } from "framer-motion"
import type React from "react"

interface HandWrittenOutlineProps {
  children: React.ReactNode
  className?: string
}

export function HandWrittenOutline({ children, className = "" }: HandWrittenOutlineProps) {
  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: {
          duration: 2.5,
          ease: [0.43, 0.13, 0.23, 0.96],
          repeat: Number.POSITIVE_INFINITY,
          repeatDelay: 0.5,
        },
        opacity: { duration: 0.5 },
      },
    },
  }

  return (
    <div className={`relative ${className}`}>
      {/* The actual button */}
      <div className="relative z-10">{children}</div>

      {/* The handwritten circle overlay */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        style={{
          top: "-44px",
          left: "-44px",
          width: "calc(100% + 88px)",
          height: "calc(100% + 88px)",
        }}
        viewBox="0 0 200 100"
        initial="hidden"
        animate="visible"
      >
        <motion.path
          d="M 18,50 
   C 18,18 38,3 100,3 
   C 162,3 182,18 182,50 
   C 182,82 162,97 100,97 
   C 38,97 18,82 18,50 Z"
          fill="transparent"
          strokeWidth="2"
          stroke="black"
          strokeLinecap="round"
          variants={draw}
        />
      </motion.svg>
    </div>
  )
}
