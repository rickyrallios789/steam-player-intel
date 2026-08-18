import { useEffect, useState } from 'react'
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Save,
  Trash2,
  DownloadCloud,
  RotateCw,
  Loader2,
  Github,
  ExternalLink,
  BellRing,
  BellOff,
  RefreshCw
} from 'lucide-react'
import { useToast } from '../components/ui'
import type { SettingsStatus, UpdateStatus } from '../global'

export default function Settings({ status, onChange }: { status: SettingsStatus | null; onChange: () => void }) {
  const [steamKey, setSteamKey] = useState('')
  const [bmToken, setBmToken] = useState('')
  const [version, setVersion] = useState('')
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  const [monitorOn, setMonitorOn] = useState(false)
  const [checking, setChecking] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    window.api.appInfo().then((i) => setVersion(i.version))
    window.api.updates.current().then(setUpd)
    window.api.monitor.status().then((s) => setMonitorOn(s.enabled))
    window.api.monitor.getWebhook().then((r) => setWebhookUrl(r.url))
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
        <div className="section-title">Background monitoring</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          When on, this app re-checks your <b>favorited</b> players about every 6 hours and shows a desktop notification
          if one gets a <b>new ban</b> or their profile <b>flips to private</b>. It runs locally and only scans accounts
          you have favorited; clicking a notification opens that player here.
        </p>
        <div className="row center between" style={{ gap: 12 }}>
          <span className="row center" style={{ gap: 8 }}>
            {monitorOn ? (
              <BellRing size={16} style={{ color: 'var(--good)' }} />
            ) : (
              <BellOff size={16} className="muted" />
            )}
            <span>{monitorOn ? 'Monitoring your favorites every 6 hours' : 'Monitoring is off'}</span>
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn"
              disabled={!monitorOn || checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const r = await window.api.monitor.runNow()
                  toast(
                    `Checked ${r.checked} favorite${r.checked === 1 ? '' : 's'} · ${r.alerts} alert${
                      r.alerts === 1 ? '' : 's'
                    }`
                  )
                } finally {
                  setChecking(false)
                }
              }}
            >
              {checking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Check now
            </button>
            <button
              className={`btn ${monitorOn ? '' : 'primary'}`}
              onClick={async () => {
                const r = await window.api.monitor.setEnabled(!monitorOn)
                setMonitorOn(r.enabled)
                toast(r.enabled ? 'Background monitoring enabled' : 'Background monitoring disabled')
              }}
            >
              {monitorOn ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 12 }}>
          Optional: also send alerts to a <b>Discord webhook</b> (channel → Edit → Integrations → Webhooks). Stored
          locally on this device.
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <input
            className="text mono"
            type="url"
            aria-label="Discord webhook URL"
            placeholder="https://discord.com/api/webhooks/…"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <button
            className="btn"
            onClick={async () => {
              await window.api.monitor.setWebhook(webhookUrl)
              toast(webhookUrl.trim() ? 'Webhook saved' : 'Webhook cleared')
            }}
          >
            <Save size={14} /> Save
          </button>
          <button
            className="btn"
            disabled={testing || !webhookUrl.trim()}
            onClick={async () => {
              setTesting(true)
              try {
                const r = await window.api.monitor.testWebhook(webhookUrl)
                toast(r.ok ? 'Test message sent' : `Test failed: ${r.error ?? 'error'}`)
              } finally {
                setTesting(false)
              }
            }}
          >
            {testing ? <Loader2 size={14} className="spin" /> : <BellRing size={14} />} Send test
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
            aria-label="Steam Web API key"
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
        <div className="section-title row center" style={{ gap: 8 }}>
          BattleMetrics API token
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              padding: '2px 6px',
              borderRadius: 4,
              color: 'var(--warn)',
              border: '1px solid var(--warn)'
            }}
          >
            EXPERIMENTAL
          </span>
          <span className="muted small" style={{ fontWeight: 400 }}>
            optional
          </span>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Experimental: BattleMetrics player matching is gated by their API, so it may return nothing even with a valid
          token, and results are labeled experimental in reports. Only used if you have authorized API access. Status:{' '}
          {status?.battlemetricsTokenSet ? <b style={{ color: 'var(--good)' }}>configured</b> : 'not set'}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="text mono"
            type="password"
            aria-label="BattleMetrics API token"
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

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="section-title">About &amp; diagnostics</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Steam Player Intel analyzes publicly available Steam account data from a single ID. It never fabricates data —
          every value is labeled with its source and status, and private or unavailable fields are shown as such.
        </p>
        <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
          <button
            className="btn small"
            onClick={() => window.api.openExternal('https://github.com/rickyrallios789/steam-player-intel')}
          >
            <Github size={13} /> Project on GitHub <ExternalLink size={12} />
          </button>
          <button className="btn small" onClick={() => window.api.openExternal('https://steamcommunity.com/dev/apikey')}>
            <KeyRound size={13} /> Get a Steam API key <ExternalLink size={12} />
          </button>
        </div>
        <div className="field-row">
          <span className="k">Version</span>
          <span className="v mono">v{version || '…'}</span>
        </div>
        <Diag
          label="Credential encryption"
          ok={!!status?.encryptionAvailable}
          okText="Active (OS keychain)"
          badText="Unavailable — session only"
        />
        <Diag label="Steam Web API key" ok={!!status?.steamKeySet} okText="Configured" badText="Not set" />
        <Diag
          label="BattleMetrics token (experimental)"
          ok={!!status?.battlemetricsTokenSet}
          okText="Configured"
          badText="Not set"
          neutralBad
        />
        <Diag
          label="Local history storage"
          ok={!!status?.persistent}
          okText="Enabled on this device"
          badText="In-memory only"
        />
      </div>
    </div>
  )
}

function Diag({
  label,
  ok,
  okText,
  badText,
  neutralBad
}: {
  label: string
  ok: boolean
  okText: string
  badText: string
  neutralBad?: boolean
}) {
  return (
    <div className="field-row">
      <span className="k">{label}</span>
      <span className={`status-pill ${ok ? 'clean' : neutralBad ? 'unknown' : 'warn'}`}>{ok ? okText : badText}</span>
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
