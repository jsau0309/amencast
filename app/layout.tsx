import type React from "react";
import type { Metadata } from "next/types";
import { ThemeProvider } from "@/components/theme-provider";
import { GeistSans } from 'geist/font/sans'; 
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from "@/components/ui/sonner"; 

export const metadata: Metadata = {
  title: "AmenCast | Real-Time Translation for Church Livestreams",
  description: "Listen to any church livestream in real-time in any language with minimal delay.",
  generator: 'v0.dev',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' } // Assuming it is a PNG file
    ]
  },
  manifest: '/site.webmanifest'
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
        <head />
        {/* 
          Your body has className="font-sans".
          Your tailwind.config.js theme.extend.fontFamily.sans should be:
          ['var(--font-geist-sans)', ...fallbacks]
          The `geist` package ensures --font-geist-sans is defined by the className on <html>.
        */}
        <body className="font-sans antialiased">
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}