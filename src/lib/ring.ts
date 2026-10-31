// A plain two-beep ringtone made with the Web Audio API (no sound file), plus vibration. Used while an incoming call rings.
let ctx: AudioContext | null = null
let timer: number | null = null

export function startRing(): void {
  stopRing()
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const c = new AC()
    ctx = c
    void c.resume().catch(() => undefined)
    const beep = (at: number, freq: number) => {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, c.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + at + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + 0.3)
      o.connect(g)
      g.connect(c.destination)
      o.start(c.currentTime + at)
      o.stop(c.currentTime + at + 0.32)
    }
    const round = () => {
      beep(0, 523)
      beep(0.4, 659)
      try {
        navigator.vibrate?.([300, 150, 300])
      } catch {
        /* vibration is optional */
      }
    }
    round()
    timer = window.setInterval(round, 2200)
  } catch {
    /* sound is optional; the on-screen call sheet still shows */
  }
}

export function stopRing(): void {
  if (timer !== null) window.clearInterval(timer)
  timer = null
  if (ctx) void ctx.close().catch(() => undefined)
  ctx = null
  try {
    navigator.vibrate?.(0)
  } catch {
    /* ignore */
  }
}
