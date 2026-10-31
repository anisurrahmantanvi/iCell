import { useCall } from '@/hooks/useCall'
import { CallScreen } from './CallScreen'

/** One call from start to finish. Mounted only while a call is open, so leaving it ends the call. */
export function ActiveCall({ callId, myId, onClose }: { callId: string; myId: string; onClose: () => void }) {
  const api = useCall({ callId, myId })
  return <CallScreen api={api} onClose={onClose} />
}
