import { useEffect, useRef, useState } from 'react'
import { Face } from '@/components/Face'
import type { CallApi } from '@/hooks/useCall'
import { personName } from '@/services/contacts'

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    if (stream) void el.play().catch(() => undefined) // autoplay can be refused until the person taps
  }, [stream])
  return <audio ref={ref} autoPlay />
}

function duration(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function statusLabel(api: CallApi): string {
  switch (api.phase) {
    case 'loading': return 'Loading…'
    case 'starting': return 'Allow microphone access…'
    case 'ringing': return 'Ringing…'
    case 'connecting': return 'Connecting…'
    case 'connected': return duration(api.seconds)
    case 'ended': return api.endReason ?? 'Call ended'
    case 'error': return 'Call problem'
  }
}

export function CallScreen({ api, onClose }: { api: CallApi; onClose: () => void }) {
  const { phase } = api
  const name = personName(api.peer)
  const live = phase === 'starting' || phase === 'ringing' || phase === 'connecting' || phase === 'connected'

  // If the audio path takes a while, say why instead of leaving the person guessing.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (phase !== 'connecting') {
      setSlow(false)
      return
    }
    const id = window.setTimeout(() => setSlow(true), 12_000)
    return () => window.clearTimeout(id)
  }, [phase])

  return (
    <div className="call" role="region" aria-label={`Call with ${name}`}>
      <RemoteAudio stream={api.remoteStream} />

      <div className="call__who">
        <Face person={api.peer} size="large" />
        <h1>{name}</h1>
        <p className="call__status" role="status" aria-live="polite">{statusLabel(api)}</p>
      </div>

      <div className="call__notes">
        {phase === 'error' && api.problem ? <p role="alert" className="notice">{api.problem.message}</p> : null}
        {phase === 'connecting' && slow ? (
          <p role="status" className="notice notice--soft">
            Still connecting… If this never connects, one of you may be on a network that needs a relay (TURN) server. TURN setup is coming soon.
          </p>
        ) : null}
      </div>

      <div className="call__actions">
        {live ? (
          <>
            <button type="button" className="round" aria-pressed={api.muted} disabled={phase === 'starting'} onClick={api.toggleMute}>
              {api.muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="round round--end" onClick={() => void api.hangUp()}>
              {phase === 'ringing' && api.isCaller ? 'Cancel' : 'End'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  )
}
