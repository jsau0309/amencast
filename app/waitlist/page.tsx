"use client"

import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"
import { Waitlist } from '@clerk/nextjs'; // Import Clerk Waitlist component

export default function WaitlistPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <LanguageToggle />
      </header>
      <main className="flex-1 flex flex-col items-center pt-16">
        <div className="w-full max-w-md space-y-10 px-4">
          {/* Custom title and subtitle from the screenshot */}
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Join the Waitlist</h1>
            <p className="text-muted-foreground">
              Be among the first 100 users to experience real-time translation for church livestreams
            </p>
          </div>
          {/* Render the Clerk Waitlist component */}
          <Waitlist />
        </div>
      </main>
    </div>
  )
}
