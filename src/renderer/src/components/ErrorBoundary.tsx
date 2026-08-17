import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** When this value changes, the boundary clears its error (e.g. navigating to a new view). */
  resetKey?: unknown
  /** Human label for where the error happened, shown in the fallback. */
  label?: string
}
interface State {
  error: Error | null
}

/**
 * Catches render-time errors in its subtree so a single bad component cannot
 * white-screen the whole app. The rest of the UI (sidebar, navigation) stays
 * usable, and the user can retry or switch views. (audit F-15)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props): void {
    // Clear the error automatically when the caller signals a context change.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  private reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="panel error-boundary" role="alert">
          <div className="row center" style={{ gap: 8 }}>
            <AlertTriangle size={18} style={{ color: 'var(--bad)' }} />
            <strong>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}.</strong>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            The rest of the app is still usable. You can try again, or switch to another view.
          </div>
          <pre className="mono error-detail">{this.state.error.message}</pre>
          <button className="btn" onClick={this.reset}>
            <RotateCw size={14} /> Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
