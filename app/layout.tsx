import type React from "react"
import type { Metadata } from "next/types"
import { ThemeProvider } from "@/components/theme-provider"
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
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/Geist-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Geist-Medium.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Geist-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @font-face {
            font-family: 'Geist Sans';
            src: url('/fonts/Geist-Regular.woff2') format('woff2');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'Geist Sans';
            src: url('/fonts/Geist-Medium.woff2') format('woff2');
            font-weight: 500;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'Geist Sans';
            src: url('/fonts/Geist-Bold.woff2') format('woff2');
            font-weight: 700;
            font-style: normal;
            font-display: swap;
          }
          :root {
            --font-geist-sans: 'Geist Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
