import { useCallback, useEffect, useRef, useState } from 'react'
import { CallEngine, classifyMediaError, type MediaError } from '@/lib/webrtc'
import { loadIceServers } from '@/lib/ice'
import { errorMessage } from '@/lib/supabase'
import { fetchSignals, getCall, sendSignal, setCallStatus, subscribeCallStatus, subscribeSignals, type CallSignal } from '@/services/calls'
import { getPerson, type Person } from '@/services/contacts'
import type { CallSession, CallStatus } from '@/types'

/**
 * Where a call is in its life. "connected" is reported only when the browser says the peer connection is connected;
 * the database status "accepted" alone means "answered, still connecting".
 */
export type CallPhase = 'loading' | 'starting' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'error'

export interface CallProblem {
  kind: MediaError | 'connection' | 'generic'
  message: string
}

export interface CallApi {
  phase: CallPhase
  call: CallSession | null
  peer: Person | null
  isCaller: boolean
  muted: boolean
  seconds: number
  problem: CallProblem | null
  endReason: string | null
  remoteStream: MediaStream | null
  hangUp: () => Promise<void>
  toggleMute: () => void
}

interface Options {
  callId: string
  myId: string
}

/** How long a call may ring before the caller gives up. Must match the incoming-call sheet's timeout. */
export const RING_WINDOW_MS = 45_000

const REASON: Partial<Record<CallStatus, string>> = {
  declined: 'Call declined',
  cancelled: 'Call cancelled',
  missed: 'No answer',
  ended: 'Call ended',
  failed: 'Connection failed',
}

const MEDIA_MESSAGES: Record<MediaError, string> = {
  'permission-denied': 'Microphone access is blocked. Allow it in the app’s permissions, then call again.',
  'no-device': 'No microphone was found on this device.',
  unsupported: 'Calling isn’t supported here.',
  unknown: 'The microphone couldn’t be started.',
}

const CONNECTION_MESSAGE =
  'The call couldn’t connect. A mobile network or firewall may be blocking direct connections, which needs a relay (TURN) server. TURN setup is coming soon.'

/**
 * Runs one voice call from either side: loads it, asks for the microphone, exchanges WebRTC signals through Supabase and keeps
 * the call row's status in step. Everything that can go wrong ends in the "error" or "ended" phase with a message;
 * nothing is ever reported as connected unless the peer connection really is.
 */
export function useCall({ callId, myId }: Options): CallApi {
  const [phase, setPhaseState] = useState<CallPhase>('loading')
  const [call, setCall] = useState<CallSession | null>(null)
  const [peer, setPeer] = useState<Person | null>(null)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [problem, setProblem] = useState<CallProblem | null>(null)
  const [endReason, setEndReason] = useState<string | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const engine = useRef<CallEngine | null>(null)
  const callRef = useRef<CallSession | null>(null)
  const phaseRef = useRef<CallPhase>('loading')
  const finished = useRef(false)
  const mounted = useRef(true)
  const seen = useRef<Set<number>>(new Set())
  const chain = useRef<Promise<void>>(Promise.resolve())
  const unsubs = useRef<Array<() => void>>([])
  const ringTimer = useRef<number | null>(null)
  const connectedAt = useRef<number | null>(null)
  const mutedRef = useRef(false)

  const setPhase = useCallback((p: CallPhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  const teardown = useCallback(() => {
    unsubs.current.splice(0).forEach((off) => off())
    if (ringTimer.current !== null) {
      window.clearTimeout(ringTimer.current)
      ringTimer.current = null
    }
    const eng = engine.current
    engine.current = null
    eng?.close()
    setRemoteStream(null)
  }, [])

  /** Normal end: shows the reason on the "ended" screen. */
  const finish = useCallback(
    (reason: string) => {
      if (finished.current) return
      finished.current = true
      teardown()
      setEndReason(reason)
      setPhase('ended')
    },
    [teardown, setPhase],
  )

  /** Abnormal end: shows the problem on the "error" screen. */
  const fail = useCallback(
    (p: CallProblem) => {
      if (finished.current) return
      finished.current = true
      teardown()
      setProblem(p)
      setPhase('error')
    },
    [teardown, setPhase],
  )

  const attachSignals = useCallback(
    (session: CallSession, eng: CallEngine) => {
      const handle = (s: CallSignal) => {
        if (s.sender_id === myId || seen.current.has(s.id)) return
        seen.current.add(s.id)
        // Signals are applied strictly in order, one at a time.
        chain.current = chain.current
          .then(async () => {
            if (finished.current) return
            if (s.kind === 'hangup') {
              finish('Call ended')
              return
            }
            await eng.handleSignal(s.kind, s.payload)
          })
          .catch(() => undefined)
      }
      // Subscribe first, then fetch what was stored before we arrived; the `seen` set removes the overlap.
      unsubs.current.push(subscribeSignals(session.id, handle))
      void fetchSignals(session.id)
        .then((rows) => rows.forEach(handle))
        .catch(() => undefined)
    },
    [myId, finish],
  )

  const begin = useCallback(
    async (role: 'caller' | 'callee', session: CallSession): Promise<void> => {
      setPhase('starting')
      const ice = await loadIceServers()
      if (finished.current) return
      const eng = new CallEngine(ice, {
        onRemoteStream: (s) => setRemoteStream(new MediaStream(s.getTracks())),
        onSignal: (kind, payload) => {
          void sendSignal(session.id, kind, payload).catch(() => undefined)
        },
        onState: (s) => {
          if (finished.current) return
          if (s === 'connected') {
            connectedAt.current = Date.now()
            setPhase('connected')
          } else if (s === 'connecting') {
            if (phaseRef.current !== 'connected' && callRef.current?.status === 'accepted') setPhase('connecting')
          } else if (s === 'failed') {
            void setCallStatus(session.id, 'failed').catch(() => undefined)
            fail({ kind: 'connection', message: CONNECTION_MESSAGE })
          }
        },
      })
      engine.current = eng

      try {
        await eng.start(role)
      } catch (e) {
        if (engine.current !== eng) return // superseded (screen closed)
        const kind: MediaError = (e as { name?: string } | null)?.name === 'NotSupported' ? 'unsupported' : classifyMediaError(e)
        // We never got the microphone, so this call cannot proceed: tell the other side right away.
        void setCallStatus(session.id, role === 'caller' ? 'cancelled' : 'declined').catch(() => undefined)
        fail({ kind, message: MEDIA_MESSAGES[kind] })
        return
      }
      if (engine.current !== eng || finished.current) return

      if (role === 'caller') {
        attachSignals(session, eng)
        if (callRef.current?.status === 'accepted') setPhase('connecting')
        else setPhase('ringing')
        ringTimer.current = window.setTimeout(() => {
          if (finished.current || callRef.current?.status !== 'ringing') return
          void setCallStatus(session.id, 'missed').catch(() => undefined)
          finish('No answer')
        }, RING_WINDOW_MS)
      } else {
        try {
          await setCallStatus(session.id, 'accepted')
        } catch {
          if (engine.current !== eng) return
          // Most likely the caller hung up while we were allowing microphone access.
          finish(REASON[callRef.current?.status ?? 'cancelled'] ?? 'Call cancelled')
          return
        }
        if (engine.current !== eng || finished.current) return
        attachSignals(session, eng)
        setPhase('connecting')
      }
    },
    [attachSignals, fail, finish, setPhase],
  )

  // Load the call and start the right flow for the caller or the callee.
  useEffect(() => {
    let cancelled = false
    finished.current = false
    seen.current = new Set()
    chain.current = Promise.resolve()
    connectedAt.current = null
    setSeconds(0)
    setProblem(null)
    setEndReason(null)
    mutedRef.current = false
    setMuted(false)
    setPhase('loading')

    void (async () => {
      try {
        const session = await getCall(callId)
        if (cancelled) return
        if (!session || (session.caller_id !== myId && session.callee_id !== myId)) {
          fail({ kind: 'generic', message: 'This call doesn’t exist, or you aren’t part of it.' })
          return
        }
        callRef.current = session
        setCall(session)

        const isCaller = session.caller_id === myId
        const otherId = isCaller ? session.callee_id : session.caller_id
        void getPerson(otherId)
          .then((p) => {
            if (!cancelled && p) setPeer(p)
          })
          .catch(() => undefined)

        if (session.status !== 'ringing' && session.status !== 'accepted') {
          finish(REASON[session.status] ?? 'Call ended')
          return
        }
        if (session.status === 'accepted') {
          // The screen was reloaded mid-call. Audio cannot be resumed, so close the call cleanly.
          void setCallStatus(session.id, 'ended').catch(() => undefined)
          finish('This call was interrupted. Start a new call to continue.')
          return
        }
        if (Date.now() - new Date(session.created_at).getTime() > RING_WINDOW_MS) {
          if (isCaller) void setCallStatus(session.id, 'missed').catch(() => undefined)
          finish(isCaller ? 'No answer' : 'This call has expired')
          return
        }

        // Follow status changes made by the other side (answered, declined, hung up).
        unsubs.current.push(
          subscribeCallStatus(session.id, (c) => {
            callRef.current = c
            setCall(c)
            if (finished.current) return
            if (c.status === 'accepted' && phaseRef.current === 'ringing') setPhase('connecting')
            const reason = REASON[c.status]
            if (reason) finish(reason)
          }),
        )

        // The callee only gets here after tapping Answer, so both sides start straight away.
        await begin(isCaller ? 'caller' : 'callee', session)
      } catch (e) {
        if (!cancelled) fail({ kind: 'generic', message: errorMessage(e) })
      }
    })()

    return () => {
      cancelled = true
      const c = callRef.current
      const wasLive = !finished.current && c !== null && phaseRef.current !== 'loading'
      const live = wasLive ? c : null
      teardown()
      // Leaving the screen during a call counts as hanging up. Deferred one tick so React StrictMode's simulated
      // unmount/remount (development only) does not hang up a call that is about to be re-attached.
      if (live) {
        window.setTimeout(() => {
          if (mounted.current) return
          if (live.status === 'ringing') {
            void setCallStatus(live.id, live.caller_id === myId ? 'cancelled' : 'declined').catch(() => undefined)
          } else if (live.status === 'accepted') {
            void sendSignal(live.id, 'hangup', {}).catch(() => undefined)
            void setCallStatus(live.id, 'ended').catch(() => undefined)
          }
        }, 0)
      }
    }
  }, [callId, myId, begin, fail, finish, setPhase, teardown])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Call timer: starts only once the connection is really up.
  useEffect(() => {
    if (phase !== 'connected') return
    const id = window.setInterval(() => {
      if (connectedAt.current !== null) setSeconds(Math.floor((Date.now() - connectedAt.current) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  const hangUp = useCallback(async () => {
    if (finished.current) return
    const c = callRef.current
    let reason = 'Call ended'
    if (c) {
      try {
        if (c.status === 'ringing') {
          const asCaller = c.caller_id === myId
          reason = asCaller ? 'Call cancelled' : 'Call declined'
          await setCallStatus(c.id, asCaller ? 'cancelled' : 'declined')
        } else if (c.status === 'accepted') {
          await sendSignal(c.id, 'hangup', {}).catch(() => undefined)
          await setCallStatus(c.id, 'ended')
        }
      } catch {
        // The other side finds out through the hangup signal or when the ring window runs out.
      }
    }
    finish(reason)
  }, [finish, myId])

  // The current value lives in a ref so the engine call happens exactly once per tap.
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    engine.current?.setMuted(next)
    setMuted(next)
  }, [])

  return {
    phase,
    call,
    peer,
    isCaller: call?.caller_id === myId,
    muted,
    seconds,
    problem,
    endReason,
    remoteStream,
    hangUp,
    toggleMute,
  }
}
