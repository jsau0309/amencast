import type React from "react"
import type { Metadata } from "next/types"
import { ThemeProvider } from "@/components/theme-provider"
import { GeistSans } from 'geist/font/sans'
import "./globals.css"

export const metadata: Metadata = {
  title: "AmenCast | Real-Time Spanish Translation for Church Livestreams",
  description: "Listen to any YouTube-hosted church livestream in real-time Spanish with minimal delay.",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <head>
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
