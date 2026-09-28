
import { useState, useEffect, useRef } from "react"
import type { ResetPanelProps, RitualType, RitualOption, RitualCompletionData } from "./types"
import { TimerHalo } from "@/components/animations/TimerHalo"

export function ResetPanel({ isOpen, onClose, onSelectRitual, onRitualComplete, sessionMode = "Zen", copy }: ResetPanelProps) {
  const [activeRitual, setActiveRitual] = useState<RitualType | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  
  // Track actual time spent for anti-cheat
  const ritualStartTime = useRef<number | null>(null)
  const plannedDuration = useRef<number>(0)

  const ritualOptions: RitualOption[] = [
    {
      id: "breath",
      label: "Breath Reset",
      duration: 120,
      description: "Ground yourself with breathing",
    },
    {
      id: "walk",
      label: "Walk Reset",
      duration: 300,
      description: "Take a short walk",
    },
    {
      id: "dump",
      label: "Dump Reset",
      duration: 180,
      description: "Write down your thoughts",
    },
    {
      id: "personal",
      label: "Personal",
      duration: 240,
      description: "Conversation, bathroom break",
    },
    {
      id: "shutdown",
      label: "Shutdown",
      duration: 900,
      description: "Close the day in three steps",
    },
  ]

  useEffect(() => {
    if (activeRitual && timeRemaining > 0) {
      const interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Ritual completed naturally - award full points
            const actualSeconds = ritualStartTime.current 
              ? Math.floor((Date.now() - ritualStartTime.current) / 1000)
              : plannedDuration.current
            
            onRitualComplete?.({
              ritualType: activeRitual,
              plannedDuration: plannedDuration.current,
              actualDuration: actualSeconds,
              wasSkipped: false,
            })
            
            setActiveRitual(null)
            ritualStartTime.current = null
            onClose()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [activeRitual, timeRemaining, onClose, onRitualComplete])

  const handleSelectRitual = (ritual: RitualOption) => {
    // The Shutdown Protocol is a guided flow, not a countdown. Hand off.
    if (ritual.id === "shutdown") {
      onSelectRitual(ritual.id)
      return
    }

    // Start tracking actual time
    ritualStartTime.current = Date.now()
    plannedDuration.current = ritual.duration
    
    setActiveRitual(ritual.id)
    setTimeRemaining(ritual.duration)
    onSelectRitual(ritual.id) // Notify that ritual started (no bonus yet!)
  }

  const handleSkipRitual = () => {
    // Calculate actual time spent before skipping
    const actualSeconds = ritualStartTime.current 
      ? Math.floor((Date.now() - ritualStartTime.current) / 1000)
      : 0
    
    // Only award points for time actually spent
    if (activeRitual && actualSeconds > 0) {
      onRitualComplete?.({
        ritualType: activeRitual,
        plannedDuration: plannedDuration.current,
        actualDuration: actualSeconds,
        wasSkipped: true,
      })
    }
    
    setActiveRitual(null)
    setTimeRemaining(0)
    ritualStartTime.current = null
    onClose()
  }

  if (!isOpen) return null

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="w-[475px] rounded-3xl bg-[#0a0f0d]/55 backdrop-blur-xl border border-emerald-500/30 shadow-2xl overflow-hidden">
      <div className="p-6 space-y-6">
        {activeRitual ? (
          // Ritual in progress view
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-light text-white">
                {ritualOptions.find((r) => r.id === activeRitual)?.label}
              </h2>
              <p className="text-sm text-zinc-400 mt-2">
                {ritualOptions.find((r) => r.id === activeRitual)?.description}
              </p>
              {copy?.prompt && (
                <p className="text-xs text-emerald-200/70 italic mt-3 px-4 leading-relaxed">{copy.prompt}</p>
              )}
            </div>

            {/* Centered countdown with pulse ring animation */}
            <div className="flex justify-center">
              <TimerHalo variant="pulse-ring" color="emerald" size={160}>
                <div className="text-4xl font-bold text-emerald-400">{formatTime(timeRemaining)}</div>
              </TimerHalo>
            </div>

            <button
              onClick={handleSkipRitual}
              className="w-full px-6 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-medium transition-colors text-sm"
            >
              Skip & Resume
            </button>
          </div>
        ) : (
          // Ritual selection view
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-light text-emerald-400">{copy?.heading ?? "Choose Your Reset"}</h2>
              <p className="text-sm text-zinc-400 mt-2">{copy?.subheading ?? "Take a moment to recharge and return focused"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {ritualOptions.map((ritual) => (
                <button
                  key={ritual.id}
                  onClick={() => handleSelectRitual(ritual)}
                  className={`p-4 rounded-lg border border-zinc-700 bg-[#0a0f0d]/80 hover:bg-zinc-800/50 hover:border-emerald-500 transition-all group text-center ${
                    ritual.id === "shutdown" ? "col-span-2" : ""
                  }`}
                >
                  <div className="text-sm font-light text-emerald-400 transition-colors mb-1">{ritual.label}</div>
                  <div className="text-xs text-zinc-500 mb-2">{ritual.description}</div>
                  <div className="text-xs text-emerald-400 font-mono">{Math.floor(ritual.duration / 60)} min</div>
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full px-6 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-medium transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
