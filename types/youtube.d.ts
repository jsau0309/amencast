interface YT {
  Player: new (
    elementId: string | HTMLElement,
    options: {
      videoId?: string
      playerVars?: {
        autoplay?: 0 | 1
        controls?: 0 | 1
        disablekb?: 0 | 1
        enablejsapi?: 0 | 1
        fs?: 0 | 1
        iv_load_policy?: 1 | 3
        modestbranding?: 0 | 1
        playsinline?: 0 | 1
        rel?: 0 | 1
        showinfo?: 0 | 1
        start?: number
        end?: number
      }
      events?: {
        onReady?: (event: { target: YT.Player }) => void
        onStateChange?: (event: { data: number; target: YT.Player }) => void
        onPlaybackQualityChange?: (event: { data: string; target: YT.Player }) => void
        onPlaybackRateChange?: (event: { data: number; target: YT.Player }) => void
        onError?: (event: { data: number }) => void
        onApiChange?: (event: object) => void
      }
    },
  ) => YT.Player

  Player: any
}

interface Window {
  YT: YT
  onYouTubeIframeAPIReady: (() => void) | null
}
