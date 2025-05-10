"use client"

import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"

export default function WaitlistPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <LanguageToggle />
      </header>
      <main className="container flex-1 flex items-center justify-center">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Join the Waitlist</h1>
            <p className="text-muted-foreground">
              Be among the first 100 users to experience real-time Spanish translation for church livestreams
            </p>
          </div>
          {/* Clerk waitlist component will be rendered here */}
          
        </div>
      </main>
    </div>
  )
}
