export type EngineState = 'idle' | 'getting-media' | 'connecting' | 'connected' | 'failed' | 'closed'
export type MediaError = 'permission-denied' | 'no-device' | 'unsupported' | 'unknown'

export interface EngineHandlers {
  onRemoteStream: (s: MediaStream) => void
  onState: (s: EngineState) => void
  /** Called for each locally generated signal; the caller sends it over Supabase. */
  onSignal: (kind: 'offer' | 'answer' | 'ice', payload: Record<string, unknown>) => void
}

export function classifyMediaError(e: unknown): MediaError {
  const name = (e as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'permission-denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device'
  if (!navigator.mediaDevices) return 'unsupported'
  return 'unknown'
}

/**
 * Thin wrapper around RTCPeerConnection for a voice call. It reports "connected" only when the browser's connection state
 * says audio can flow; it never fakes a successful call.
 */
export class CallEngine {
  private pc: RTCPeerConnection | null = null
  private local: MediaStream | null = null
  private pendingIce: RTCIceCandidateInit[] = []
  private remoteDescSet = false
  private closed = false

  constructor(private readonly iceServers: RTCIceServer[], private readonly h: EngineHandlers) {}

  async start(role: 'caller' | 'callee'): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      throw Object.assign(new Error('Calling is not supported here.'), { name: 'NotSupported' })
    }
    this.h.onState('getting-media')
    this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    if (this.closed) {
      this.local.getTracks().forEach((t) => t.stop())
      return
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.pc = pc
    this.local.getTracks().forEach((t) => pc.addTrack(t, this.local as MediaStream))

    const remote = new MediaStream()
    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => remote.addTrack(t))
      if (!ev.streams[0]) remote.addTrack(ev.track)
      this.h.onRemoteStream(remote)
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.h.onSignal('ice', ev.candidate.toJSON() as Record<string, unknown>)
    }
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected': this.h.onState('connected'); break
        case 'connecting': this.h.onState('connecting'); break
        case 'failed': this.h.onState('failed'); break
        case 'closed': this.h.onState('closed'); break
        default: break
      }
    }
    this.h.onState('connecting')

    if (role === 'caller') {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.h.onSignal('offer', { type: offer.type, sdp: offer.sdp })
    }
  }

  async handleSignal(kind: 'offer' | 'answer' | 'ice', payload: Record<string, unknown>): Promise<void> {
    const pc = this.pc
    if (!pc || this.closed) return
    if (kind === 'offer') {
      await pc.setRemoteDescription(payload as unknown as RTCSessionDescriptionInit)
      this.remoteDescSet = true
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.h.onSignal('answer', { type: answer.type, sdp: answer.sdp })
      await this.flushIce()
    } else if (kind === 'answer') {
      if (pc.signalingState !== 'have-local-offer') return
      await pc.setRemoteDescription(payload as unknown as RTCSessionDescriptionInit)
      this.remoteDescSet = true
      await this.flushIce()
    } else if (kind === 'ice') {
      const cand = payload as unknown as RTCIceCandidateInit
      if (this.remoteDescSet) await pc.addIceCandidate(cand).catch(() => undefined)
      else this.pendingIce.push(cand)
    }
  }

  private async flushIce(): Promise<void> {
    const pc = this.pc
    if (!pc) return
    const queued = this.pendingIce.splice(0)
    for (const c of queued) await pc.addIceCandidate(c).catch(() => undefined)
  }

  setMuted(muted: boolean): void {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  }

  close(): void {
    this.closed = true
    this.local?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.pc = null
    this.local = null
    this.h.onState('closed')
  }
}
