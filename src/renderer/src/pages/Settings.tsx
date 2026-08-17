import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldAlert, Save, Trash2, DownloadCloud, RotateCw, Loader2 } from 'lucide-react'
import { useToast } from '../components/ui'
import type { SettingsStatus, UpdateStatus } from '../global'

export default function Settings({ status, onChange }: { status: SettingsStatus | null; onChange: () => void }) {
  const [steamKey, setSteamKey] = useState('')
  const [bmToken, setBmToken] = useState('')
  const [version, setVersion] = useState('')
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  const toast = useToast()

  useEffect(() => {
    window.api.appInfo().then((i) => setVersion(i.version))
    window.api.updates.current().then(setUpd)
    const off = window.api.updates.onStatus(setUpd)
    return off
  }, [])

  const save = async (name: 'STEAM_API_KEY' | 'BATTLEMETRICS_API_TOKEN', value: string, clear = false) => {
    await window.api.settings.setCredential(name, clear ? '' : value)
    if (name === 'STEAM_API_KEY') setSteamKey('')
    else setBmToken('')
    onChange()
    toast(clear ? 'Credential cleared' : 'Credential saved securely')
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-title">Application & updates</div>
        <div className="row between center wrap" style={{ gap: 12 }}>
          <div>
            <div>
              Steam Player Intel <span className="mono">v{version || '…'}</span>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              <UpdateLine upd={upd} onRestart={() => window.api.updates.install()} />
            </div>
          </div>
          <button
            className="btn"
            disabled={upd.state === 'checking' || upd.state === 'downloading'}
            onClick={async () => {
              setUpd({ state: 'checking' })
              await window.api.updates.check()
            }}
          >
            {upd.state === 'checking' ? <Loader2 size={14} className="spin" /> : <DownloadCloud size={14} />} Check for
            updates
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-title">Credential security</div>
        <div className="row center" style={{ gap: 10 }}>
          {status?.encryptionAvailable ? (
            <>
              <ShieldCheck size={18} style={{ color: 'var(--good)' }} />
              <span>
                OS-level encryption is active. Keys are encrypted at rest with your system keychain and never leave this
                machine or reach the app’s frontend.
              </span>
            </>
          ) : (
            <>
              <ShieldAlert size={18} style={{ color: 'var(--warn)' }} />
              <span>
                OS encryption is unavailable on this system. Keys will be kept in memory for this session only and not
                written to disk.
              </span>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-title">Steam Web API key (required)</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Get a free key at{' '}
          <a onClick={() => window.api.openExternal('https://steamcommunity.com/dev/apikey')} style={{ cursor: 'pointer' }}>
            steamcommunity.com/dev/apikey
          </a>
          . Status: {status?.steamKeySet ? <b style={{ color: 'var(--good)' }}>configured</b> : <b style={{ color: 'var(--warn)' }}>not set</b>}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="text mono"
            type="password"
            placeholder="Paste Steam Web API key"
            value={steamKey}
            onChange={(e) => setSteamKey(e.target.value)}
          />
          <button className="btn primary" disabled={!steamKey.trim()} onClick={() => save('STEAM_API_KEY', steamKey)}>
            <Save size={14} /> Save
          </button>
          {status?.steamKeySet && (
            <button className="btn" onClick={() => save('STEAM_API_KEY', '', true)}>
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-title">BattleMetrics API token (optional)</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Only used if you have authorized API access. Enables Rust server history where your token permits. Status:{' '}
          {status?.battlemetricsTokenSet ? <b style={{ color: 'var(--good)' }}>configured</b> : 'not set'}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="text mono"
            type="password"
            placeholder="Paste BattleMetrics API token"
            value={bmToken}
            onChange={(e) => setBmToken(e.target.value)}
          />
          <button className="btn primary" disabled={!bmToken.trim()} onClick={() => save('BATTLEMETRICS_API_TOKEN', bmToken)}>
            <Save size={14} /> Save
          </button>
          {status?.battlemetricsTokenSet && (
            <button className="btn" onClick={() => save('BATTLEMETRICS_API_TOKEN', '', true)}>
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="section-title">Data & cache</div>
        <div className="row center between">
          <span className="muted small">Clear all cached API responses to force fresh data on the next scan.</span>
          <button
            className="btn"
            onClick={async () => {
              await window.api.cache.clear()
              toast('Cache cleared')
            }}
          >
            <KeyRound size={14} /> Clear cache
          </button>
        </div>
        <div className="row center between" style={{ marginTop: 12 }}>
          <span className="muted small">
            Delete all locally stored player history, notes and tags. This cannot be undone.
          </span>
          <button
            className="btn"
            onClick={async () => {
              if (!window.confirm('Delete all locally stored player history, notes and tags? This cannot be undone.'))
                return
              await window.api.history.clearAll()
              toast('All history cleared')
            }}
          >
            <Trash2 size={14} /> Clear all history
          </button>
        </div>
      </div>
    </div>
  )
}

function UpdateLine({ upd, onRestart }: { upd: UpdateStatus; onRestart: () => void }) {
  switch (upd.state) {
    case 'checking':
      return <>Checking for updates…</>
    case 'available':
      return <>Update available: v{upd.version} — downloading in the background…</>
    case 'downloading':
      return <>Downloading update… {upd.percent}%</>
    case 'downloaded':
      return (
        <span className="row center" style={{ gap: 8 }}>
          Update v{upd.version} ready.
          <button className="btn small primary" onClick={onRestart}>
            <RotateCw size={12} /> Restart & install
          </button>
        </span>
      )
    case 'not-available':
      return <>You’re on the latest version.</>
    case 'dev':
      return <>{upd.message}</>
    case 'error':
      return <span style={{ color: 'var(--bad)' }}>Update error: {upd.message}</span>
    default:
      return <>Automatic updates are enabled. Updates install on the next restart.</>
  }
}
