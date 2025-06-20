"use client"

export function AnnouncementBanner() {
  const text = "Early access will be granted on July, 1st 2025 🌎"

  return (
    <div className="bg-black text-white py-2 overflow-hidden relative">
      <div className="flex animate-scroll-infinite">
        {/* First set of text */}
        <div className="flex shrink-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={`first-${i}`} className="inline-block px-8 text-sm font-medium whitespace-nowrap">
              {text}
            </span>
          ))}
        </div>
        {/* Duplicate set for seamless loop */}
        <div className="flex shrink-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={`second-${i}`} className="inline-block px-8 text-sm font-medium whitespace-nowrap">
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
