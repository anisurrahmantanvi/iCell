export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'missed' | 'ended' | 'failed'

export interface CallSession {
  id: string
  caller_id: string
  callee_id: string
  status: CallStatus
  created_at: string
  started_at: string | null
  ended_at: string | null
}
