"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Settings } from "lucide-react"

export function SettingsButton() {
  const [originalVolume, setOriginalVolume] = useState(50)
  const [translatedVolume, setTranslatedVolume] = useState(100)
  const [showCaptions, setShowCaptions] = useState(true)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-6 w-6" /> {/* Increased from h-5 w-5 */}
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Adjust your audio and caption preferences</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="original-volume">Original Audio Volume</Label>
            <Slider
              id="original-volume"
              min={0}
              max={100}
              step={1}
              value={[originalVolume]}
              onValueChange={(value) => setOriginalVolume(value[0])}
            />
            <span className="text-xs text-muted-foreground">{originalVolume}%</span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="translated-volume">Spanish Audio Volume</Label>
            <Slider
              id="translated-volume"
              min={0}
              max={100}
              step={1}
              value={[translatedVolume]}
              onValueChange={(value) => setTranslatedVolume(value[0])}
            />
            <span className="text-xs text-muted-foreground">{translatedVolume}%</span>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="captions" className="flex-1">
              Show Captions
            </Label>
            <Switch id="captions" checked={showCaptions} onCheckedChange={setShowCaptions} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
