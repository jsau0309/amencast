"use client"

import type React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { HandWrittenOutline } from "@/components/hand-written-outline"

export function CTASection() {
  return (
    <section
      className="relative overflow-hidden bg-white py-24 md:py-32"
      style={
        {
          "--brand": "220 9% 46%", // Gray-600
          "--brand-foreground": "215 28% 17%", // Gray-800
        } as React.CSSProperties
      }
    >
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center" style={{ marginTop: "-5%" }}>
        <h2 className="text-4xl md:text-6xl font-bold text-black mb-8 tracking-tight">
          Ready to break down language barriers?
        </h2>

        <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
          Join the first beta users to experience real-time translation for church livestreams.
        </p>

        <div className="flex justify-center">
          <div className="inline-block" style={{ padding: "10px" }}>
            <HandWrittenOutline>
              <Button
                asChild
                size="lg"
                className="bg-black text-white hover:bg-gray-800 px-8 py-6 text-lg font-semibold"
              >
                <Link href="/waitlist">Join the Waitlist</Link>
              </Button>
            </HandWrittenOutline>
          </div>
        </div>

        <p className="text-sm text-gray-500 mt-6 pt-[10%]">Spots are limited — early users help us improve.</p>
      </div>
    </section>
  )
}
