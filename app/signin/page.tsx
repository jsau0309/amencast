"use client"

import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <LanguageToggle />
      </header>

      <main className="container flex-1 flex items-center justify-center">
        <SignIn routing="hash" />
      </main>
    </div>
  )
}
