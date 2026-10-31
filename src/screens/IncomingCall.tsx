import { useEffect, useRef, useState } from 'react'
import { Face } from '@/components/Face'
import { RING_WINDOW_MS } from '@/hooks/useCall'
import { startRing, stopRing } from '@/lib/ring'
import { setCallStatus, subscribeCallStatus, subscribeIncomingCalls } from '@/services/calls'
import { getPerson, personName, type Person } from '@/services/contacts'
import type { CallSession } from '@/types'

interface Incoming {
  call: CallSession
  caller: Person | null
}

/**
 * Listens (one realtime subscription) for calls addressed to the signed-in person and rings with an answer / decline sheet.
 * Works only while iCell is open: ringing while the app is closed or the phone is locked is a later step ("Coming soon").
 */
export function IncomingCall({ myId, busy, onAnswer }: { myId: string; busy: boolean; onAnswer: (callId: string) => void }) {
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const busyRef = useRef(busy)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    return subscribeIncomingCalls(myId, (call) => {
      // Already in a call: tell the caller we are busy instead of ringing.
      if (busyRef.current) {
        void setCallStatus(call.id, 'declined').catch(() => undefined)
        return
      }
      void getPerson(call.caller_id)
        .catch(() => null)
        .then((caller) => setIncoming({ call, caller }))
    })
  }, [myId])

  const callId = incoming?.call.id ?? null

  // Ring, and stop when the caller hangs up first or nobody answers in time.
  useEffect(() => {
    if (!callId) return
    const off = subscribeCallStatus(callId, (c) => {
      if (c.status !== 'ringing') setIncoming(null)
    })
    const t = window.setTimeout(() => setIncoming(null), RING_WINDOW_MS)
    startRing()
    return () => {
      off()
      window.clearTimeout(t)
      stopRing()
    }
  }, [callId])

  if (!incoming) return null
  const name = personName(incoming.caller)

  return (
    <div className="incoming" role="alertdialog" aria-label={`Incoming call from ${name}`}>
      <div className="call__who">
        <Face person={incoming.caller} size="large" />
        <h1>{name}</h1>
        <p className="call__status">Incoming voice call…</p>
      </div>
      <div className="call__actions">
        <button
          type="button"
          className="round round--end"
          onClick={() => {
            const id = incoming.call.id
            setIncoming(null)
            void setCallStatus(id, 'declined').catch(() => undefined)
          }}
        >
          Decline
        </button>
        <button
          type="button"
          className="round round--accept"
          onClick={() => {
            const id = incoming.call.id
            setIncoming(null)
            onAnswer(id)
          }}
        >
          Answer
        </button>
      </div>
    </div>
  )
}
