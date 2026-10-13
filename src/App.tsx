import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './lib/session'
import { useSettings } from './lib/queries'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import SettingsPage from './pages/Settings'
import Setup from './pages/Setup'
import About from './pages/About'

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <img src="/icons/icon-512.png" alt="" className="h-24 w-24 opacity-90" />
      <p className="text-sm text-mist">{text}</p>
    </div>
  )
}

const tabs = [
  { to: '/', label: 'Clock', icon: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { to: '/history', label: 'History', icon: 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z' },
  { to: '/settings', label: 'Settings', icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4' },
]

export default function App() {
  const { ready, error } = useSession()
  const settings = useSettings()
  const { pathname } = useLocation()

  // Public info page: no sign-in needed
  if (pathname === '/about') return <About />

  if (error) return <Splash text={`Couldn't start: ${error}`} />
  if (!ready || settings.isLoading) return <Splash text="Loading…" />
  if (settings.error) return <Splash text={`Couldn't load settings: ${settings.error.message}`} />
  if (!settings.data?.setup_completed) return <Setup />

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <img src="/brand/lz.png" alt="Leading Zero" className="h-9 w-9" />
        <span className="font-display text-sm tracking-[0.2em] text-fog">TIMETRACK</span>
      </header>

      <main className="flex-1 px-4 pb-28">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-3 text-[11px] font-medium tracking-wide transition-colors ${
                  isActive ? 'text-cyan' : 'text-mist'}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
