import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/* ---------- Merge token: carries an anonymous user's punches into an email account ---------- */
const MERGE_KEY = 'timetrack.mergeToken'
const store = {
  get: () => { try { return localStorage.getItem(MERGE_KEY) } catch { return null } },
  set: (v: string) => { try { localStorage.setItem(MERGE_KEY, v) } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(MERGE_KEY) } catch { /* private mode */ } },
}

/** Call while still anonymous, right before signing into an existing email account. */
export async function prepareMerge() {
  const { data } = await supabase.rpc('create_merge_token')
  if (typeof data === 'string' && data) store.set(data)
}

interface Ctx {
  session: Session | null
  user: User | null
  ready: boolean
  error: string | null
}

const SessionCtx = createContext<Ctx>({ session: null, user: null, ready: false, error: null })

/* Frictionless identity: reuse the stored session, otherwise sign in anonymously.
   When a different user signs in (email link or code), claim any pending merge,
   make sure a profile exists, and reset cached data. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeUid = useRef<string | null>(null)

  useEffect(() => {
    let alive = true

    async function activate(s: Session) {
      if (activeUid.current === s.user.id) { setSession(s); return }
      activeUid.current = s.user.id
      setReady(false)

      if (!s.user.is_anonymous) {
        const token = store.get()
        if (token) {
          await supabase.rpc('claim_merge', { p_token: token })
          store.clear()
        }
      }
      const { error: pe } = await supabase.rpc('ensure_profile')
      if (!alive) return
      if (pe) { setError(pe.message); return }
      qc.clear()
      setSession(s)
      setReady(true)
    }

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) return activate(data.session)
      // Visitors reading the public info page don't need an account yet
      if (window.location.pathname === '/about') return
      const { data: anon, error: e } = await supabase.auth.signInAnonymously()
      if (e) { if (alive) setError(e.message); return }
      if (anon.session) await activate(anon.session)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) void activate(s)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [qc])

  return (
    <SessionCtx.Provider value={{ session, user: session?.user ?? null, ready, error }}>
      {children}
    </SessionCtx.Provider>
  )
}

export const useSession = () => useContext(SessionCtx)
