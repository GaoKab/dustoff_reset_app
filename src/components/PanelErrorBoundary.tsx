// src/components/PanelErrorBoundary.tsx
// A render error anywhere below the HUD used to unmount the whole React
// tree: with a transparent window that looks like the app vanished, HUD
// included. This boundary keeps the HUD on screen and shows one line with
// a way back. `AppErrorBoundary` is the last resort around the whole app.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Called when the person taps the fallback; the parent closes the panel */
  onReset?: () => void
  /** Rendered in place of the failed subtree; the default is a one-line card */
  fallback?: (reset: () => void) => ReactNode
  /** Changing this (e.g. the open panel) clears a caught error automatically */
  resetKey?: string | number | null
}

interface State {
  error: Error | null
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Panel] Render error, falling back to the HUD:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset)
    return (
      <button
        onClick={this.reset}
        className="mt-3 w-[320px] flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#0a0f0d]/90 backdrop-blur-xl border border-amber-400/40 shadow-2xl text-left"
      >
        <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0" />
        <span className="text-xs text-zinc-200">
          Something went wrong. <span className="text-amber-200">Tap to reopen.</span>
        </span>
      </button>
    )
  }
}

/** Last resort around the whole app: a HUD-sized pill that reloads on tap. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App] Render error at the root:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="w-full h-full bg-transparent flex items-start justify-center pt-2">
        <button
          onClick={() => window.location.reload()}
          className="w-[320px] h-[60px] rounded-full bg-[#0a0f0d]/90 backdrop-blur-xl border border-amber-400/40 shadow-2xl flex items-center justify-center gap-2 text-xs text-zinc-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          Something went wrong. <span className="text-amber-200">Tap to reload.</span>
        </button>
      </div>
    )
  }
}
