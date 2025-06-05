import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Globe } from "@/components/ui/globe"
import { ShootingStars } from "@/components/ui/shooting-stars"
import { FeaturesSection } from "@/components/features-section"
import { CTASection } from "@/components/cta-section"
import { AnnouncementBanner } from "@/components/announcement-banner"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBanner />

      <header className="container flex items-center justify-between py-5">
        <Logo />
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign In</Link>
          </Button>
        </div>
      </header>

      <main className="container flex-1 flex flex-col items-center justify-center relative">
        {/* ShootingStars with only orange color and multiple stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <ShootingStars
            starColor="#FB6415"
            trailColor="rgba(0, 0, 0, 0.7)"
            minSpeed={6}
            maxSpeed={10}
            minDelay={1200}
            maxDelay={3600}
            minStarWidth={6.6}
            maxStarWidth={13.2}
            minStarHeight={1.1}
            maxStarHeight={2.75}
            maxStars={5}
          />
        </div>

        <div className="text-center max-w-[800px] mx-auto mb-8 pt-14 md:pt-[4.85rem] relative z-10">
          <h1 className="text-5xl md:text-7xl font-bold font-sans leading-tight tracking-tighter">
            Every voice deserves to belong.
          </h1>
          <p className="mt-5 text-[1.21rem] text-muted-foreground">
            Hear the service live, in the language that feels like home.
          </p>

          {/* Join Waitlist button right under the tagline */}
          <div className="mt-8">
            <Button asChild size="lg" className="px-8 py-6 text-lg">
              <Link href="/waitlist">Join the Waitlist</Link>
            </Button>
          </div>
        </div>

        {/* Globe Component with reduced bottom margin on mobile */}
        <div className="relative w-full h-[400px] md:h-[480px] mb-16 md:mb-32">
          <Globe />
        </div>

        {/* Mission heading with reduced top padding on mobile */}
        <div className="text-center max-w-[800px] mx-auto mb-8 pt-8 md:pt-[4.85rem] relative z-10">
          <h1 className="text-5xl md:text-7xl font-bold font-sans leading-tight tracking-tighter">What is Amencast?</h1>
          <p className="mt-4 pt-[5%] text-xl text-muted-foreground max-w-2xl mx-auto font-sans">
            AmenCast is a real-time AI audio translation platform built for churches to instantly translate sermons into
            any language with natural voices and biblical accuracy.
          </p>
        </div>

        {/* Features Section */}
        <FeaturesSection />
      </main>

      {/* CTA Section */}
      <CTASection />

      {/* Footer with proper z-index and background */}
      <footer className="border-t py-6 md:py-0 relative z-10 bg-background">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            &copy; {new Date().getFullYear()} AmenCast. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
