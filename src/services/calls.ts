import { channelName, supabase } from '@/lib/supabase'
import type { CallSession, CallStatus } from '@/types'

const CALL_COLS = 'id, caller_id, callee_id, status, created_at, started_at, ended_at'

export type SignalKind = 'offer' | 'answer' | 'ice' | 'hangup'
export interface CallSignal {
  id: number
  call_id: string
  sender_id: string
  kind: SignalKind
  payload: Record<string, unknown>
  created_at: string
}

export async function createCall(calleeId: string): Promise<CallSession> {
  const { data, error } = await supabase.from('icell_calls').insert({ callee_id: calleeId }).select(CALL_COLS).single()
  if (error) throw new Error(error.message)
  return data as CallSession
}

export async function getCall(id: string): Promise<CallSession | null> {
  const { data, error } = await supabase.from('icell_calls').select(CALL_COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as CallSession | null) ?? null
}

export async function setCallStatus(id: string, status: CallStatus): Promise<void> {
  const { error } = await supabase.from('icell_calls').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function sendSignal(callId: string, kind: SignalKind, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('icell_call_signals').insert({ call_id: callId, kind, payload })
  if (error) throw new Error(error.message)
}

/** Signals stored before this phone subscribed (the offer may arrive before the callee answers). */
export async function fetchSignals(callId: string): Promise<CallSignal[]> {
  const { data, error } = await supabase
    .from('icell_call_signals')
    .select('id, call_id, sender_id, kind, payload, created_at')
    .eq('call_id', callId)
    .order('id', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as CallSignal[]
}

export function subscribeSignals(callId: string, onSignal: (s: CallSignal) => void): () => void {
  const channel = supabase
    .channel(channelName(`icell-signals:${callId}`))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'icell_call_signals', filter: `call_id=eq.${callId}` }, (p) => onSignal(p.new as CallSignal))
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export function subscribeCallStatus(callId: string, onChange: (c: CallSession) => void): () => void {
  const channel = supabase
    .channel(channelName(`icell-status:${callId}`))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'icell_calls', filter: `id=eq.${callId}` }, (p) => onChange(p.new as CallSession))
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export function subscribeIncomingCalls(userId: string, onIncoming: (c: CallSession) => void): () => void {
  const channel = supabase
    .channel(channelName(`icell-incoming:${userId}`))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'icell_calls', filter: `callee_id=eq.${userId}` }, (p) => {
      const call = p.new as CallSession
      if (call.status === 'ringing') onIncoming(call)
    })
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
