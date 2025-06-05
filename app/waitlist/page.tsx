import type { Metadata } from 'next';
import WaitlistContent from './waitlist-content'; // Import the new client component

// metadata object remains here
export const metadata: Metadata = {
  title: "Join the AmenCast Waitlist | Real-Time Church Translation",
  description: "Be among the first to experience AmenCast — a platform that brings real-time audio translation to church livestreams. Break language barriers and make every sermon accessible.",
  keywords: [
    "church translation", "real-time translation", "Spanish church livestream", 
    "AmenCast", "multilingual worship", "church tech", "audio dubbing", "church accessibility"
  ],
  metadataBase: new URL("https://www.amencast.tech"),
  generator: "v0.dev",
  openGraph: {
    title: "Join the AmenCast Waitlist",
    description: "Experience real-time sermon translation with AmenCast. Make church services accessible to all languages.",
    url: "https://www.amencast.tech/waitlist",
    siteName: "AmenCast",
    images: [
      {
        url: "/amencast-org-image.png", 
        width: 1200,
        height: 630,
        alt: "AmenCast Waitlist Promotion",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AmenCast | Real-Time Church Translation",
    description: "Join our waitlist and help make worship accessible in every language.",
    images: ["/amencast-org-image.png"],
  },
};

// This is now a Server Component that renders the Client Component
export default function WaitlistPage() {
  return <WaitlistContent />;
}
