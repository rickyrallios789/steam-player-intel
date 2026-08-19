import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  LayoutDashboard,
  Search,
  History as HistoryIcon,
  Star,
  GitCompare,
  Users,
  ClipboardList,
  Settings as SettingsIcon,
  Shield,
  Moon,
  Sun
} from 'lucide-react'
import { ToastProvider } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import HistoryPage from './pages/History'
import Compare from './pages/Compare'
import BulkScreen from './pages/BulkScreen'
import Rosters from './pages/Rosters'
import Settings from './pages/Settings'
import { CommandPalette, type Command } from './components/CommandPalette'
import type { SettingsStatus } from './global'

type View = 'home' | 'dashboard' | 'history' | 'favorites' | 'compare' | 'bulk' | 'rosters' | 'settings'

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [bulkPreset, setBulkPreset] = useState<string | null>(null)
  const [theme, toggleTheme] = useTheme()
  const [status, setStatus] = useState<SettingsStatus | null>(null)

  // "Screen now" on a saved roster: preload its members into Bulk screen and run.
  const screenRoster = (members: string): void => {
    setBulkPreset(members)
    setView('bulk')
  }

  const refreshStatus = useCallback(async () => {
    setStatus(await window.api.settings.status())
  }, [])
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const analyzeFromElsewhere = (q: string) => {
    setPendingQuery(q)
    setView('dashboard')
  }

  // Clicking a background-monitor notification opens that player here.
  useEffect(() => {
    const off = window.api.monitor.onOpen((steam64) => {
      setPendingQuery(steam64)
      setView('dashboard')
    })
    return off
  }, [])

  // Command palette (Ctrl/Cmd+K).
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const commands = useMemo<Command[]>(
    () => [
      { id: 'nav-home', label: 'Go to Home', run: () => setView('home') },
      { id: 'nav-dashboard', label: 'Go to Player Search', run: () => setView('dashboard') },
      { id: 'nav-history', label: 'Go to Recent Players', run: () => setView('history') },
      { id: 'nav-favorites', label: 'Go to Favorites', run: () => setView('favorites') },
      { id: 'nav-compare', label: 'Go to Compare', run: () => setView('compare') },
      { id: 'nav-bulk', label: 'Go to Bulk screen', run: () => setView('bulk') },
      { id: 'nav-rosters', label: 'Go to Saved rosters', run: () => setView('rosters') },
      { id: 'nav-settings', label: 'Go to Settings', run: () => setView('settings') },
      { id: 'toggle-theme', label: 'Toggle light / dark theme', run: toggleTheme }
    ],
    [toggleTheme]
  )

  const nav = (v: View, icon: React.ReactNode, label: string) => (
    <button
      className={`nav-item ${view === v ? 'active' : ''}`}
      onClick={() => setView(v)}
      aria-current={view === v ? 'page' : undefined}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <ToastProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo">
              <Shield size={18} />
            </div>
            <div>
              Player Intel
              <div className="muted small" style={{ fontWeight: 400 }}>
                Steam analyzer
              </div>
            </div>
          </div>
          {nav('home', <LayoutDashboard size={17} />, 'Home')}
          {nav('dashboard', <Search size={17} />, 'Player Search')}
          {nav('history', <HistoryIcon size={17} />, 'Recent Players')}
          {nav('favorites', <Star size={17} />, 'Favorites')}
          {nav('compare', <GitCompare size={17} />, 'Compare')}
          {nav('bulk', <Users size={17} />, 'Bulk screen')}
          {nav('rosters', <ClipboardList size={17} />, 'Saved rosters')}
          <div className="nav-spacer" />
          {!status?.steamKeySet && (
            <button className="nav-item" style={{ color: 'var(--warn)' }} onClick={() => setView('settings')}>
              <SettingsIcon size={17} /> Add Steam key
            </button>
          )}
          {nav('settings', <SettingsIcon size={17} />, 'Settings')}
          <button className="nav-item" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </aside>

        <main className="main">
          <ErrorBoundary resetKey={view} label="this view">
            {view === 'home' && (
              <Home status={status} onAnalyze={analyzeFromElsewhere} goSettings={() => setView('settings')} />
            )}
            {view === 'dashboard' && (
              <Dashboard
                status={status}
                pendingQuery={pendingQuery}
                clearPending={() => setPendingQuery(null)}
                goSettings={() => setView('settings')}
              />
            )}
            {view === 'history' && <HistoryPage onAnalyze={analyzeFromElsewhere} favoritesOnly={false} />}
            {view === 'favorites' && <HistoryPage onAnalyze={analyzeFromElsewhere} favoritesOnly={true} />}
            {view === 'compare' && <Compare status={status} />}
            {view === 'bulk' && (
              <BulkScreen
                onAnalyze={analyzeFromElsewhere}
                initialText={bulkPreset}
                onConsumeInitial={() => setBulkPreset(null)}
              />
            )}
            {view === 'rosters' && <Rosters onScreen={screenRoster} />}
            {view === 'settings' && <Settings status={status} onChange={refreshStatus} />}
          </ErrorBoundary>
        </main>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={commands}
          onAnalyze={analyzeFromElsewhere}
        />
      </div>
    </ToastProvider>
  )
}
