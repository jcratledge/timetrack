import { useEffect, useState } from 'react'
import { Card, btn } from './ui'

interface BIPEvent extends Event { prompt: () => Promise<void> }

const DISMISS_KEY = 'timetrack.installDismissed'
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Android/Chrome: one-tap install. iPhone: Share, then Add to Home Screen. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (dismissed || isStandalone()) return null
  const ios = isIOS()
  if (!evt && !ios) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  return (
    <Card className="border-cyan/40">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-512.png" alt="" className="h-10 w-10 rounded-lg" />
        <div className="flex-1 text-sm text-fog">
          <p className="font-semibold">Install Timetrack</p>
          {ios ? (
            <p className="mt-1 text-mist">
              In Safari, tap <strong className="text-fog">Share</strong>{' '}
              <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              , then <strong className="text-fog">Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="mt-1 text-mist">Add it to your home screen for one-tap punching.</p>
          )}
        </div>
        <button aria-label="Dismiss" onClick={dismiss} className="text-lg text-mist">×</button>
      </div>
      {evt && !ios && (
        <button className={`${btn.primary} mt-3`} onClick={async () => { await evt.prompt(); setEvt(null) }}>
          Install app
        </button>
      )}
    </Card>
  )
}
