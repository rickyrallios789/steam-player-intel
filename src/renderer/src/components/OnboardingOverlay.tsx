import { useEffect, useState, type ReactNode } from 'react'
import { Shield, KeyRound, Search, ClipboardList, Users2, Activity, Check, X, ExternalLink } from 'lucide-react'
import type { SettingsStatus } from '../global'

/**
 * First-run welcome tour. (v0.8.2)
 *
 * A dismissable 3-step overlay shown once on first launch (persisted via a flag in
 * App). It sets expectations honestly up front — sourced data, everything labeled,
 * never accuses — then helps the user add a Steam key and points out the main areas.
 * Re-openable any time from the command palette ("Show welcome tour").
 */
interface Step {
  title: string
  body: ReactNode
}

export function OnboardingOverlay({
  status,
  onClose,
  goSettings,
  goSearch
}: {
  status: SettingsStatus | null
  onClose: () => void
  goSettings: () => void
  goSearch: () => void
}) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const keySet = !!status?.steamKeySet

  const steps: Step[] = [
    {
      title: 'Welcome to Steam Player Intel',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            Paste any Steam ID, profile URL, or vanity name and get a clear, sourced picture of a public Steam account —
            built for screening Rust players.
          </p>
          <div className="muted small" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <span className="row center" style={{ gap: 8 }}>
              <Check size={14} style={{ color: 'var(--good)' }} /> <b>Never fabricates data</b> — hidden or missing
              values are shown as PRIVATE / UNAVAILABLE.
            </span>
            <span className="row center" style={{ gap: 8 }}>
              <Check size={14} style={{ color: 'var(--good)' }} /> <b>Every value is labeled</b> with its source and
              status.
            </span>
            <span className="row center" style={{ gap: 8 }}>
              <Check size={14} style={{ color: 'var(--good)' }} /> <b>Never accuses</b> — bans and signals are facts and
              leads to review, not proof.
            </span>
            <span className="row center" style={{ gap: 8 }}>
              <Check size={14} style={{ color: 'var(--good)' }} /> <b>Local-first</b> — your history and settings stay on
              this machine.
            </span>
          </div>
        </>
      )
    },
    {
      title: 'Add your Steam Web API key',
      body: (
        <>
          <p style={{ marginTop: 0 }}>
            Lookups use the official Steam Web API, so you'll need a free key (one-time setup).
          </p>
          {keySet ? (
            <div className="callout info" style={{ marginTop: 8 }}>
              <span className="row center" style={{ gap: 8 }}>
                <Check size={15} style={{ color: 'var(--good)' }} /> Your Steam key is already set — you're ready to go.
              </span>
            </div>
          ) : (
            <ol style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
              <li>
                <button
                  className="btn small"
                  onClick={() => window.api.openExternal('https://steamcommunity.com/dev/apikey')}
                >
                  <KeyRound size={13} /> Get a free key <ExternalLink size={11} />
                </button>
              </li>
              <li>
                Paste it into{' '}
                <button
                  className="btn small"
                  onClick={() => {
                    goSettings()
                    onClose()
                  }}
                >
                  Open Settings
                </button>
              </li>
              <li>Come back and search any player.</li>
            </ol>
          )}
        </>
      )
    },
    {
      title: 'Find your way around',
      body: (
        <>
          <div style={{ display: 'grid', gap: 10 }}>
            <TourRow icon={<Activity size={16} />} label="Home">
              A live feed of changes across everyone you've scanned — new bans and privacy flips highlighted.
            </TourRow>
            <TourRow icon={<Search size={16} />} label="Player Search">
              Deep report on one account: bans, account age, Rust hours, names, servers, and a Friends tab that screens
              their friends list for bans.
            </TourRow>
            <TourRow icon={<Users2 size={16} />} label="Bulk screen">
              Paste a whole roster and screen everyone at once.
            </TourRow>
            <TourRow icon={<ClipboardList size={16} />} label="Saved rosters">
              Save groups and auto re-screen them on a schedule, with a Discord digest of changes.
            </TourRow>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button
              className="btn primary"
              onClick={() => {
                goSearch()
                onClose()
              }}
            >
              <Search size={13} /> Try a lookup
            </button>
          </div>
        </>
      )
    }
  ]

  const last = step === steps.length - 1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,7,13,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 'min(580px, 92vw)', maxHeight: '86vh', overflow: 'auto', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome tour"
      >
        <div className="row between center" style={{ marginBottom: 8 }}>
          <div className="row center" style={{ gap: 10 }}>
            <div className="logo">
              <Shield size={18} />
            </div>
            <strong>Steam Player Intel</strong>
          </div>
          <button className="copy-btn" onClick={onClose} aria-label="Skip welcome tour" title="Skip">
            <X size={14} />
          </button>
        </div>

        <h2 style={{ margin: '6px 0 10px' }}>{steps[step].title}</h2>
        <div style={{ minHeight: 190 }}>{steps[step].body}</div>

        <div className="row between center" style={{ marginTop: 18 }}>
          <div className="row" style={{ gap: 6 }}>
            {steps.map((_, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === step ? 'var(--accent)' : 'var(--bg-2)'
                }}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {step > 0 && (
              <button className="btn" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            {!last ? (
              <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
                Next
              </button>
            ) : (
              <button className="btn primary" onClick={onClose}>
                Get started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TourRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--accent)', marginTop: 2 }}>{icon}</span>
      <span className="small">
        <b>{label}</b> — <span className="muted">{children}</span>
      </span>
    </div>
  )
}
