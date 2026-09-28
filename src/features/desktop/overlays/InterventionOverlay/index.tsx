
import { useEffect, useState } from "react"
import type { InterventionOverlayProps } from "./types"
import { X } from "lucide-react"

const INTERVENTION_CONFIG = {
  friction: {
    Zen: {
      title: "Friction Detected",
      message: "Take a moment to breathe. Reset your focus. You are in control of your emotions.",
      action: "Take a Break",
    },
    Flow: {
      title: "Friction Detected",
      message: "Pause and reset your focus. Multiple context switches can pull you out of flow state.",
      action: "Reset Focus",
    },
    Legend: {
      title: "FRICTION DETECTED",
      message: "Stop now and reset. Multiple distractions detected. You're losing cognitive bandwidth.",
      action: "RESET NOW",
    },
  },
  "focus-slipping": {
    Zen: {
      title: "Focus Slipping",
      message: "Don't let yourself be distracted. Let's keep focus!",
      action: "Pause & Reflect",
    },
    Flow: {
      title: "Focus Slipping",
      message: "Don't let yourself be distracted. Let's keep focus!",
      action: "Assess & Reset",
    },
    Legend: {
      title: "FOCUS SLIPPING",
      message: "Don't let yourself be distracted. Let's keep focus!",
      action: "STOP SESSION",
    },
  },
  "non-whitelisted-app": {
    Zen: {
      title: "Non Whitelisted App or Website",
      message: "Reserve your energy for the tasks that matter. You can do this!",
      action: "Close & Refocus",
    },
    Flow: {
      title: "Non Whitelisted App or Website",
      message: "Reserve your energy for the tasks that matter. You can do this!",
      action: "Close App",
    },
    Legend: {
      title: "NON WHITELISTED APP OR WEBSITE",
      message: "Reserve your energy for the tasks that matter. You can do this!",
      action: "CLOSE NOW",
    },
  },
  "tab-switch": {
    Zen: {
      title: "Detrimental Tab or Context Switching",
      message: "One tab at a time. One app at a time. We will win the race.",
      action: "Pause Session",
    },
    Flow: {
      title: "Detrimental Tab or Context Switching",
      message: "One tab at a time. One app at a time. We will win the race.",
      action: "Reset Flow",
    },
    Legend: {
      title: "DETRIMENTAL TAB OR CONTEXT SWITCHING",
      message: "One tab at a time. One app at a time. We will win the race.",
      action: "FOCUS OR QUIT",
    },
  },
}

export function InterventionOverlay({ isOpen, type, mode, details, copy, onDismiss, onAction }: InterventionOverlayProps) {
  const [flowAnimationStage, setFlowAnimationStage] = useState<"exploding" | "moving">("exploding")

  const config = copy || INTERVENTION_CONFIG[type]?.[mode] || {
    title: "Intervention",
    message: "Take a moment to refocus.",
    action: "Continue",
  }

  useEffect(() => {
    if (isOpen) {
      if (mode === "Flow") {
        setFlowAnimationStage("exploding")
        const moveTimer = setTimeout(() => {
          setFlowAnimationStage("moving")
        }, 1000)

        const dismissTimer = setTimeout(() => {
          onDismiss()
        }, 10000)

        return () => {
          clearTimeout(moveTimer)
          clearTimeout(dismissTimer)
        }
      } else {
        const timer = setTimeout(() => {
          onDismiss()
        }, 10000)
        return () => clearTimeout(timer)
      }
    }
  }, [isOpen, onDismiss, mode])

  if (!isOpen) return null

  const message = config.message.replace("[APP]", details?.appName || "an unknown app")

  if (mode === "Zen") {
    return (
      <div className="w-full mt-3 mb-3 animate-in slide-in-from-right-full duration-700 ease-out flex justify-center">
        <div className="w-[70%] rounded-lg bg-emerald-950/60 backdrop-blur-sm border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.4)] p-5 space-y-3">
          <div className="space-y-2">
            <h3 className="text-sm font-light text-emerald-400 uppercase tracking-wider">{config.title}</h3>
            <p className="text-sm text-emerald-100/90 leading-relaxed">{message}</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onAction || onDismiss}
              className="flex-1 px-4 py-2 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors"
            >
              {config.action}
            </button>
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-md bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/40 text-emerald-400 text-sm font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>

          <div className="w-full h-1 bg-emerald-900/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/60"
              style={{
                animation: "shrink 10s linear",
              }}
            />
          </div>
        </div>

      </div>
    )
  }

  if (mode === "Flow") {
    return (
      <div className="w-full mt-3 mb-3 animate-in slide-in-from-left-full duration-700 ease-out">
        <div className="w-full rounded-lg bg-cyan-950/60 backdrop-blur-sm border-2 border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.4)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <h3 className="text-sm font-light text-cyan-400 uppercase tracking-wider">{config.title}</h3>
              <p className="text-sm text-cyan-100/90 leading-relaxed">{message}</p>
            </div>
            <button onClick={onDismiss} className="ml-4 text-cyan-400 hover:text-cyan-300 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onAction || onDismiss}
              className="flex-1 px-4 py-2 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-sm font-medium transition-colors"
            >
              {config.action}
            </button>
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-md bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-700/40 text-cyan-400 text-sm font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>

          <div className="w-full h-1 bg-cyan-900/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500/60"
              style={{
                animation: "shrink 10s linear",
              }}
            />
          </div>
        </div>

      </div>
    )
  }

  if (mode === "Legend") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-red-950/30 via-black to-red-950/30" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-96 h-96 rounded-full bg-red-500/20 animate-pulse blur-3xl" />
        </div>

        <div className="relative w-full max-w-2xl mx-4 rounded-3xl bg-red-950/80 backdrop-blur-xl border-2 border-red-500/50 shadow-[0_0_100px_rgba(239,68,68,0.6)] p-10 space-y-6 animate-in zoom-in-95 duration-500">
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-red-400 uppercase tracking-wider">{config.title}</h2>
            <p className="text-lg text-red-100/90 leading-relaxed">{message}</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onAction || onDismiss}
              className="flex-1 px-6 py-4 rounded-xl border-2 border-red-500/50 bg-red-500/30 hover:bg-red-500/40 text-red-100 text-base font-bold transition-colors shadow-lg shadow-red-500/20"
            >
              {config.action}
            </button>
            <button
              onClick={onDismiss}
              className="px-6 py-4 rounded-xl border-2 border-red-700/50 bg-red-900/50 hover:bg-red-800/50 text-red-300 text-base font-semibold transition-colors"
            >
              Dismiss
            </button>
          </div>

          <div className="w-full h-2 bg-red-900/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
              style={{
                animation: "shrink 10s linear",
              }}
            />
          </div>
        </div>

      </div>
    )
  }

  return null
}
