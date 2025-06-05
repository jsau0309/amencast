import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex items-center justify-between py-5">
        <Logo />
      </header>

      <main className="container flex-1 flex flex-col items-center justify-center relative">
        <div className="text-center max-w-[600px] mx-auto relative z-10">
          {/* Large 404 number */}
          <div className="text-8xl md:text-9xl font-bold text-black/10 mb-4 select-none">404</div>

          {/* Main heading */}
          <h1 className="text-4xl md:text-6xl font-bold font-sans leading-tight tracking-tighter mb-6">
            Page not found
          </h1>

          {/* Description */}
          <p className="text-xl text-muted-foreground mb-8 max-w-md mx-auto">
            The page you're looking for doesn't exist or has been moved to a new location.
          </p>

          {/* Action button - Black button that routes to home */}
          <div className="flex justify-center">
            <Button asChild size="lg" className="px-8 py-6 text-lg">
              <Link href="/" className="flex items-center gap-2">
                <ArrowLeft className="h-5 w-5" />
                Go Back
              </Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
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