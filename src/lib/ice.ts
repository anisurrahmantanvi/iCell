/**
 * Servers WebRTC uses to find a route between two phones.
 * Public STUN only for now: it does not relay audio, so some networks (many mobile carriers, strict Wi-Fi) will fail to connect.
 * Short-lived TURN relay credentials will be added here in a later step (fetched from a server function, never stored in the app).
 */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  return [{ urls: 'stun:stun.l.google.com:19302' }]
}
