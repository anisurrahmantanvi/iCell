import { useEffect, useRef, useState } from 'react'
import { Face } from '@/components/Face'
import { RING_WINDOW_MS } from '@/hooks/useCall'
import { startRing, stopRing } from '@/lib/ring'
import { getCall, setCallStatus, subscribeCallStatus, subscribeIncomingCalls } from '@/services/calls'
import { getPerson, personName, type Person } from '@/services/contacts'
import type { CallSession } from '@/types'

interface Incoming {
  call: CallSession
  caller: Person | null
}

/**
 * Listens (one realtime subscription) for calls addressed to the signed-in person and rings with an answer / decline sheet.
 * This sheet rings while iCell is open. When iCell is closed or the phone is locked, a phone push (CallMessagingService) rings instead
 * and tapping it brings the same sheet up through `pushedCallId`.
 */
export function IncomingCall({
  myId,
  busy,
  pushedCallId,
  onAnswer,
}: {
  myId: string
  busy: boolean
  /** A call whose notification was tapped: show its sheet even though the realtime message was missed. */
  pushedCallId: string | null
  onAnswer: (callId: string) => void
}) {
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

  useEffect(() => {
    if (!pushedCallId) return
    let off = false
    void getCall(pushedCallId)
      .then(async (call) => {
        if (off || !call || call.callee_id !== myId || call.status !== 'ringing') return
        if (Date.now() - new Date(call.created_at).getTime() > RING_WINDOW_MS) return
        const caller = await getPerson(call.caller_id).catch(() => null)
        if (!off) setIncoming({ call, caller })
      })
      .catch(() => undefined)
    return () => {
      off = true
    }
  }, [pushedCallId, myId])

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
