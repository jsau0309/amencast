import type React from "react";
import type { Metadata } from "next/types";
import { ThemeProvider } from "@/components/theme-provider";
import { GeistSans } from 'geist/font/sans'; // Import GeistSans
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from "@/components/ui/sonner"; // Import Toaster

export const metadata: Metadata = {
  title: "AmenCast | Real-Time Spanish Translation for Church Livestreams",
  description: "Listen to any YouTube-hosted church livestream in real-time Spanish with minimal delay.",
  generator: 'v0.dev'
};

// NO const geistSans = GeistSans({ ... }) instantiation here

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
            <Toaster /> {/* Add Toaster here */}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}