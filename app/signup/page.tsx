"use client"

import { Logo } from "@/components/logo"
import { LanguageToggle } from "@/components/language-toggle"

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <LanguageToggle />
      </header>

      <main className="container flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          {/* Clerk SignUp component will be rendered here */}
          {/* The actual Clerk component will be added when Clerk is integrated */}
        </div>
      </main>
    </div>
  )
}
